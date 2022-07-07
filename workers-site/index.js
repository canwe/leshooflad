import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'
import { deflateSync, inflateSync } from 'zlib'
var URLSafeBase64 = require('urlsafe-base64');

/**
 * The DEBUG flag will do two things that help during development:
 * 1. we will skip caching on the edge, which makes it easier to
 *    debug.
 * 2. we will return an error message on exception in your Response rather
 *    than the default 404.html page.
 */
const DEBUG = false

addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled(event));
});

addEventListener('fetch', event => {
  try {
    event.respondWith(handleEvent(event))
  } catch (e) {
    if (DEBUG) {
      return event.respondWith(
        new Response(e.message || e.toString(), {
          status: 500,
        }),
      )
    }
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

async function handleEvent(event) {
  const url = new URL(event.request.url)

  if ('/file-upload' == url.pathname) {
    return handleFileUpload(event.request)
  }

  if ('/submit' == url.pathname) {
    return handleSubmit(event.request)
  }

  if ('/rec' == url.pathname) {
    return handleRec(event.request)
  }

  let options = {}

  /**
   * You can add custom logic to how we fetch your assets
   * by configuring the function `mapRequestToAsset`
   */
  options.mapRequestToAsset = handlePrefix(/^\/public/)

  try {
    if (DEBUG) {
      // customize caching
      options.cacheControl = {
        bypassCache: true,
      };
    }
    const page = await getAssetFromKV(event, options);

    // allow headers to be altered
    const response = new Response(page.body, page);

    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "unsafe-url");
    response.headers.set("Feature-Policy", "none");

    return response;

  } catch (e) {
    // if an error is thrown try to serve the asset at 404.html
    if (!DEBUG) {
      try {
        let notFoundResponse = await getAssetFromKV(event, {
          mapRequestToAsset: req => new Request(`${new URL(req.url).origin}/404.html`, req),
        })

        return new Response(notFoundResponse.body, { ...notFoundResponse, status: 404 })
      } catch (e) {}
    }

    return new Response(e.message || e.toString(), { status: 500 })
  }
}

/**
 * Here's one example of how to modify a request to
 * remove a specific prefix, in this case `/docs` from
 * the url. This can be useful if you are deploying to a
 * route on a zone, or if you only want your static content
 * to exist at a specific path.
 */
function handlePrefix(prefix) {
  return request => {
    // compute the default (e.g. / -> index.html)
    let defaultAssetKey = mapRequestToAsset(request)
    let url = new URL(defaultAssetKey.url)

    // strip the prefix from the path for lookup
    url.pathname = url.pathname.replace(prefix, '/')

    // inherit all other props from the default request
    return new Request(url.toString(), defaultAssetKey)
  }
}

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleFileUpload(request) {
  const formData = await request.formData();

  // Get the File from the form. Key for the file is 'image' for me
  const file = formData.get('file');

  const hash = await sha1(file);
  const exc = await excerpt(file);
  const gzipped = await gz(file);

  await CONTENT.put(hash, gzipped, {
    metadata: { uploaded: Date.now() },
  });

  // https://stackabuse.com/encoding-and-decoding-base64-strings-in-node-js/
  // https://stackoverflow.com/questions/7625251/compression-and-decompression-of-data-using-zlib-in-nodejs
  // inflateSync(new Buffer(gzipped, 'base64'));

  return new Response(
    JSON.stringify({
      name: file.name,
      type: file.type,
      size: file.size,
      excerpt: exc,
      hash,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}


async function handleRec(request) {

  const url = new URL(request.url)
  let params = url.searchParams;
  const token = params.get('lstoken');

  console.log(`token = ${token}`)

  // https://stackoverflow.com/questions/12631010/is-base64-encoding-url-safe
  let token_b64 = URLSafeBase64.decode(token).toString();
  let strkey = inflateSync(new Buffer(token_b64, 'base64')).toString();

  console.log(`deflated token = ${strkey}`)

  var hash, email, progress, title;
  [hash, email, progress, title] = strkey.split(":");

  if (isEmailValid(email)) {
    await SUBSCRIPTIONS.put(hash + ":" + email, "", {
      metadata: { created: Date.now(), progress: progress, title: title },
    });
    console.log(`created subscription ${strkey}`);
  }
  return new Response(
    JSON.stringify({
      status: 'ok',
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

async function sha1(file) {
  const fileData = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', fileData);
  const array = Array.from(new Uint8Array(digest));
  const sha1 =  array.map(b => b.toString(16).padStart(2, '0')).join('')
  return sha1;
}

async function gz(file) {
  const filePromise = file.text();
  return await filePromise
  .then(function(data) {
    return deflateSync(data);
  })
  .then(function(buf) {
    return buf.toString('base64');
  });
}

async function excerpt(file) {
  const filePromise = file.text();
  return await filePromise.then(function(value) {
    return (value || "").slice(0, 700);
  });
}

var emailRegex = /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

function isEmailValid(email) {
    if (!email)
        return false;

    if(email.length>254)
        return false;

    var valid = emailRegex.test(email);
    if(!valid)
        return false;

    // Further checking of some things regex can't handle
    var parts = email.split("@");
    if(parts[0].length>64)
        return false;

    var domainParts = parts[1].split(".");
    if(domainParts.some(function(part) { return part.length>63; }))
        return false;

    return true;
}

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleSubmit(request) {
  const json = await request.json();

  const email = json.email;
  const hash = json.hash;
  const value = json.value;
  const title = json.title;

  if (isEmailValid(email)) {
    await SUBSCRIPTIONS.put(hash + ":" + email, "", {
      metadata: { created: Date.now(), progress: "0/" + value, title: (title || "").slice(0, 255) },
    });
    console.log('created subscription', hash + ":" + email, value);
  }

  return new Response(
    JSON.stringify({
      status: "ok",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

async function sendMail(strkey, metadata) {
  var post = {
    subject: `LeShooflad ${metadata.title} excerpt ${metadata.progress}`,
    title: `${metadata.title}`,
    progress: `${metadata.progress}`,
    previous: '',
    excerpt: 'Lorem Ipsum is simply dummy text of the printing and typesetting industry.',
    token: '',
  }

  var hash, email;
  [hash, email] = strkey.split(":")

  let b64 = await CONTENT.get(hash);
  let content = inflateSync(new Buffer(b64, 'base64')).toString();

  var left, right;
  [left, right] = metadata.progress.split("/");
  [left, right] = [parseInt(left), parseInt(right)];

  const size = Math.ceil(content.length / right);
  post.excerpt = content.slice(size * (left - 1), size * left + 1);

  let token_b64 = deflateSync(strkey + ":" + metadata.progress + ":" + metadata.title).toString('base64');
  let safetoken = URLSafeBase64.encode(new Buffer(token_b64)).toString()
  post.token = safetoken;

  const emailContent = emailTemplate(post);

  const send_request = new Request('https://api.sendinblue.com/v3/smtp/email', {
    body: JSON.stringify({
      'sender': {
        'email': 'vrebesbyrd@gmail.com',
      },
      'to': [{'email': email}],
      'subject': post.subject,
      'htmlContent': emailContent
    }),
    headers: {
      'api-key': `${SENDINBLUE_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    method: 'POST',
  })

  const resp = await fetch(send_request);
  const respText = await resp.text();
  console.log(resp.status + " " + resp.statusText + "\n\n" + respText)

  return new Response(
    JSON.stringify({
      status: "ok",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}


async function processSubscription(item) {

  var meta = item.metadata;

  const progress = meta.progress;

  console.log('processing', item.name, progress);

  var left, right;
  [left, right] = progress.split("/");
  [left, right] = [parseInt(left), parseInt(right)];

  if (left < right) {
    meta.progress = "" + (left + 1) + "/" + right;
    await sendMail(item.name, meta);
    await SUBSCRIPTIONS.delete(item.name);
    console.log('email has been sent', item.name);
  } else {
    await SUBSCRIPTIONS.delete(item.name);
    console.log('stopped sending emails', item.name);
  }

}


//https://medium.com/@_jonas/iterate-over-cloudflare-workers-kv-ab7e42330795
async function listAll() {
  // list all keys from a given NAMESPACE,
  let entries = await SUBSCRIPTIONS.list();

  // get cursor, if returned
  let cursor = entries.cursor;

  // get entries from first call above

  // делаем "map" массива в промисы
  let promises = entries.keys.map(processSubscription);
  // ждем когда всё промисы будут выполнены
  await Promise.all(promises);

  // as long as `entries.list_complete` is false, loop over the next block
  while (!entries.list_complete) {
    let next_value = await SUBSCRIPTIONS.list({cursor: cursor});
    // update `entries.list_complete` to break the loop
    // as soon as we've got all keys
    entries.list_complete = next_value.list_complete;
    // update cursor for the next call
    cursor = next_value.cursor

    promises = next_value.keys.map(processSubscription);
    await Promise.all(promises);
  }
}

async function handleScheduled(event) {
  // Write code for updating your API
  switch (event.cron) {
    // You can set up to three schedules maximum.
    case '*/10 * * * *':
      console.log('case */10 * * * *');
      // Every ten minutes
      // await updateAPI2();

      // 1. maintain collections SUBSCRIPTIONS
      // where key is hash:email and value is in form 0/45
      // where 0 is the number of sent emails out of 45 total
      // {"frf3asda4fdf:michel@gmail.com": "12/30"}
      // for now do not support the part "each next only after you read the previous"
      // but it could be done by adding a handler which stores the read event in the metadata for this key
      // and if there is no metadata for this key, then the next email doesn't have to be sent
      // 1.1. for mvp it's enough to just send emails on schedule
      // 2. so after sending an email, the counter is incremented until it hits the <total> value
      // 3. after that, we remove this key from collection


      await listAll();


      break;
  }
  console.log('cron processed');
}


//https://web.archive.org/web/20220705175846/https://krasimirtsonev.com/blog/article/Javascript-template-engine-in-just-20-line
const emailTemplate = post => `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${post.subject}</title>
    <style type="text/css">
			/* /\/\/\/\/\/\/\/\/ CLIENT-SPECIFIC STYLES /\/\/\/\/\/\/\/\/ */
			#outlook a{padding:0;} /* Force Outlook to provide a "view in browser" message */
			.ReadMsgBody{width:100%;} .ExternalClass{width:100%;} /* Force Hotmail to display emails at full width */
			.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%;} /* Force Hotmail to display normal line spacing */
			body, table, td, p, a, li, blockquote{-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;} /* Prevent WebKit and Windows mobile changing default text sizes */
			table, td{mso-table-lspace:0pt; mso-table-rspace:0pt;} /* Remove spacing between tables in Outlook 2007 and up */
			img{-ms-interpolation-mode:bicubic;} /* Allow smoother rendering of resized image in Internet Explorer */

			/* /\/\/\/\/\/\/\/\/ RESET STYLES /\/\/\/\/\/\/\/\/ */
			body{margin:0; padding:0;}
			img{border:0; height:auto; line-height:100%; outline:none; text-decoration:none;}
			table{border-collapse:collapse !important;}
			body, #bodyTable, #bodyCell{height:100% !important; margin:0; padding:0; width:100% !important;}

			/* /\/\/\/\/\/\/\/\/ TEMPLATE STYLES /\/\/\/\/\/\/\/\/ */

			/* ========== Page Styles ========== */

			#bodyCell{padding:20px;}
			#templateContainer{width:600px;}

			/**
			* @tab Page
			* @section background style
			* @tip Set the background color and top border for your email. You may want to choose colors that match your company's branding.
			* @theme page
			*/
			body, #bodyTable{
				/*@editable*/ background-color:#DEE0E2;
			}

			/**
			* @tab Page
			* @section background style
			* @tip Set the background color and top border for your email. You may want to choose colors that match your company's branding.
			* @theme page
			*/
			#bodyCell{
				/*@editable*/ border-top:4px solid #BBBBBB;
			}

			/**
			* @tab Page
			* @section email border
			* @tip Set the border for your email.
			*/
			#templateContainer{
				/*@editable*/ border:1px solid #BBBBBB;
			}

			/**
			* @tab Page
			* @section heading 1
			* @tip Set the styling for all first-level headings in your emails. These should be the largest of your headings.
			* @style heading 1
			*/
			h1{
				/*@editable*/ color:#202020 !important;
				display:block;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:26px;
				/*@editable*/ font-style:normal;
				/*@editable*/ font-weight:bold;
				/*@editable*/ line-height:100%;
				/*@editable*/ letter-spacing:normal;
				margin-top:0;
				margin-right:0;
				margin-bottom:10px;
				margin-left:0;
				/*@editable*/ text-align:left;
			}

			/**
			* @tab Page
			* @section heading 2
			* @tip Set the styling for all second-level headings in your emails.
			* @style heading 2
			*/
			h2{
				/*@editable*/ color:#404040 !important;
				display:block;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:20px;
				/*@editable*/ font-style:normal;
				/*@editable*/ font-weight:bold;
				/*@editable*/ line-height:100%;
				/*@editable*/ letter-spacing:normal;
				margin-top:0;
				margin-right:0;
				margin-bottom:10px;
				margin-left:0;
				/*@editable*/ text-align:left;
			}

			/**
			* @tab Page
			* @section heading 3
			* @tip Set the styling for all third-level headings in your emails.
			* @style heading 3
			*/
			h3{
				/*@editable*/ color:#606060 !important;
				display:block;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:16px;
				/*@editable*/ font-style:italic;
				/*@editable*/ font-weight:normal;
				/*@editable*/ line-height:100%;
				/*@editable*/ letter-spacing:normal;
				margin-top:0;
				margin-right:0;
				margin-bottom:10px;
				margin-left:0;
				/*@editable*/ text-align:left;
			}

			/**
			* @tab Page
			* @section heading 4
			* @tip Set the styling for all fourth-level headings in your emails. These should be the smallest of your headings.
			* @style heading 4
			*/
			h4{
				/*@editable*/ color:#808080 !important;
				display:block;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:14px;
				/*@editable*/ font-style:italic;
				/*@editable*/ font-weight:normal;
				/*@editable*/ line-height:100%;
				/*@editable*/ letter-spacing:normal;
				margin-top:0;
				margin-right:0;
				margin-bottom:10px;
				margin-left:0;
				/*@editable*/ text-align:left;
			}

			/* ========== Header Styles ========== */

			/**
			* @tab Header
			* @section preheader style
			* @tip Set the background color and bottom border for your email's preheader area.
			* @theme header
			*/
			#templatePreheader{
				/*@editable*/ background-color:#F4F4F4;
				/*@editable*/ border-bottom:1px solid #CCCCCC;
			}

			/**
			* @tab Header
			* @section preheader text
			* @tip Set the styling for your email's preheader text. Choose a size and color that is easy to read.
			*/
			.preheaderContent{
				/*@editable*/ color:#808080;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:10px;
				/*@editable*/ line-height:125%;
				/*@editable*/ text-align:left;
			}

			/**
			* @tab Header
			* @section preheader link
			* @tip Set the styling for your email's preheader links. Choose a color that helps them stand out from your text.
			*/
			.preheaderContent a:link, .preheaderContent a:visited, /* Yahoo! Mail Override */ .preheaderContent a .yshortcuts /* Yahoo! Mail Override */{
				/*@editable*/ color:#606060;
				/*@editable*/ font-weight:normal;
				/*@editable*/ text-decoration:underline;
			}

			/**
			* @tab Header
			* @section header style
			* @tip Set the background color and borders for your email's header area.
			* @theme header
			*/
			#templateHeader{
				/*@editable*/ background-color:#F4F4F4;
				/*@editable*/ border-top:1px solid #FFFFFF;
				/*@editable*/ border-bottom:1px solid #CCCCCC;
			}

			/**
			* @tab Header
			* @section header text
			* @tip Set the styling for your email's header text. Choose a size and color that is easy to read.
			*/
			.headerContent{
				/*@editable*/ color:#505050;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:20px;
				/*@editable*/ font-weight:bold;
				/*@editable*/ line-height:100%;
				/*@editable*/ padding-top:0;
				/*@editable*/ padding-right:0;
				/*@editable*/ padding-bottom:0;
				/*@editable*/ padding-left:0;
				/*@editable*/ text-align:left;
				/*@editable*/ vertical-align:middle;
			}

			/**
			* @tab Header
			* @section header link
			* @tip Set the styling for your email's header links. Choose a color that helps them stand out from your text.
			*/
			.headerContent a:link, .headerContent a:visited, /* Yahoo! Mail Override */ .headerContent a .yshortcuts /* Yahoo! Mail Override */{
				/*@editable*/ color:#EB4102;
				/*@editable*/ font-weight:normal;
				/*@editable*/ text-decoration:underline;
			}

			#headerImage{
				height:auto;
				max-width:600px;
			}

			/* ========== Body Styles ========== */

			/**
			* @tab Body
			* @section body style
			* @tip Set the background color and borders for your email's body area.
			*/
			#templateBody{
				/*@editable*/ background-color:#F4F4F4;
				/*@editable*/ border-top:1px solid #FFFFFF;
				/*@editable*/ border-bottom:1px solid #CCCCCC;
			}

			/**
			* @tab Body
			* @section body text
			* @tip Set the styling for your email's main content text. Choose a size and color that is easy to read.
			* @theme main
			*/
			.bodyContent{
				/*@editable*/ color:#505050;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:14px;
				/*@editable*/ line-height:150%;
				padding-top:20px;
				padding-right:20px;
				padding-bottom:20px;
				padding-left:20px;
				/*@editable*/ text-align:left;
			}

			/**
			* @tab Body
			* @section body link
			* @tip Set the styling for your email's main content links. Choose a color that helps them stand out from your text.
			*/
			.bodyContent a:link, .bodyContent a:visited, /* Yahoo! Mail Override */ .bodyContent a .yshortcuts /* Yahoo! Mail Override */{
				/*@editable*/ color:#EB4102;
				/*@editable*/ font-weight:normal;
				/*@editable*/ text-decoration:underline;
			}

			.bodyContent img{
				display:inline;
				height:auto;
				max-width:560px;
			}

			/* ========== Footer Styles ========== */

			/**
			* @tab Footer
			* @section footer style
			* @tip Set the background color and borders for your email's footer area.
			* @theme footer
			*/
			#templateFooter{
				/*@editable*/ background-color:#F4F4F4;
				/*@editable*/ border-top:1px solid #FFFFFF;
			}

			/**
			* @tab Footer
			* @section footer text
			* @tip Set the styling for your email's footer text. Choose a size and color that is easy to read.
			* @theme footer
			*/
			.footerContent{
				/*@editable*/ color:#808080;
				/*@editable*/ font-family:Helvetica;
				/*@editable*/ font-size:10px;
				/*@editable*/ line-height:150%;
				padding-top:20px;
				padding-right:20px;
				padding-bottom:20px;
				padding-left:20px;
				/*@editable*/ text-align:left;
			}

			/**
			* @tab Footer
			* @section footer link
			* @tip Set the styling for your email's footer links. Choose a color that helps them stand out from your text.
			*/
			.footerContent a:link, .footerContent a:visited, /* Yahoo! Mail Override */ .footerContent a .yshortcuts, .footerContent a span /* Yahoo! Mail Override */{
				/*@editable*/ color:#606060;
				/*@editable*/ font-weight:normal;
				/*@editable*/ text-decoration:underline;
			}

			/* /\/\/\/\/\/\/\/\/ MOBILE STYLES /\/\/\/\/\/\/\/\/ */

            @media only screen and (max-width: 480px){
				/* /\/\/\/\/\/\/ CLIENT-SPECIFIC MOBILE STYLES /\/\/\/\/\/\/ */
				body, table, td, p, a, li, blockquote{-webkit-text-size-adjust:none !important;} /* Prevent Webkit platforms from changing default text sizes */
                body{width:100% !important; min-width:100% !important;} /* Prevent iOS Mail from adding padding to the body */

				/* /\/\/\/\/\/\/ MOBILE RESET STYLES /\/\/\/\/\/\/ */
				#bodyCell{padding:10px !important;}

				/* /\/\/\/\/\/\/ MOBILE TEMPLATE STYLES /\/\/\/\/\/\/ */

				/* ======== Page Styles ======== */

				/**
				* @tab Mobile Styles
				* @section template width
				* @tip Make the template fluid for portrait or landscape view adaptability. If a fluid layout doesn't work for you, set the width to 300px instead.
				*/
				#templateContainer{
					max-width:600px !important;
					/*@editable*/ width:100% !important;
				}

				/**
				* @tab Mobile Styles
				* @section heading 1
				* @tip Make the first-level headings larger in size for better readability on small screens.
				*/
				h1{
					/*@editable*/ font-size:24px !important;
					/*@editable*/ line-height:100% !important;
				}

				/**
				* @tab Mobile Styles
				* @section heading 2
				* @tip Make the second-level headings larger in size for better readability on small screens.
				*/
				h2{
					/*@editable*/ font-size:20px !important;
					/*@editable*/ line-height:100% !important;
				}

				/**
				* @tab Mobile Styles
				* @section heading 3
				* @tip Make the third-level headings larger in size for better readability on small screens.
				*/
				h3{
					/*@editable*/ font-size:18px !important;
					/*@editable*/ line-height:100% !important;
				}

				/**
				* @tab Mobile Styles
				* @section heading 4
				* @tip Make the fourth-level headings larger in size for better readability on small screens.
				*/
				h4{
					/*@editable*/ font-size:16px !important;
					/*@editable*/ line-height:100% !important;
				}

				/* ======== Header Styles ======== */

				#templatePreheader{display:none !important;} /* Hide the template preheader to save space */

				/**
				* @tab Mobile Styles
				* @section header image
				* @tip Make the main header image fluid for portrait or landscape view adaptability, and set the image's original width as the max-width. If a fluid setting doesn't work, set the image width to half its original size instead.
				*/
				#headerImage{
					height:auto !important;
					/*@editable*/ max-width:600px !important;
					/*@editable*/ width:100% !important;
				}

				/**
				* @tab Mobile Styles
				* @section header text
				* @tip Make the header content text larger in size for better readability on small screens. We recommend a font size of at least 16px.
				*/
				.headerContent{
					/*@editable*/ font-size:20px !important;
					/*@editable*/ line-height:125% !important;
				}

				/* ======== Body Styles ======== */

				/**
				* @tab Mobile Styles
				* @section body text
				* @tip Make the body content text larger in size for better readability on small screens. We recommend a font size of at least 16px.
				*/
				.bodyContent{
					/*@editable*/ font-size:18px !important;
					/*@editable*/ line-height:125% !important;
				}

				/* ======== Footer Styles ======== */

				/**
				* @tab Mobile Styles
				* @section footer text
				* @tip Make the body content text larger in size for better readability on small screens.
				*/
				.footerContent{
					/*@editable*/ font-size:14px !important;
					/*@editable*/ line-height:115% !important;
				}

				.footerContent a{display:block !important;} /* Place footer social and utility links on their own lines, for easier access */
			}
		</style>
</head>
<body leftmargin="0" marginwidth="0" topmargin="0" marginheight="0" offset="0">
<center>
    <table align="center" border="0" cellpadding="0" cellspacing="0" height="100%" width="100%" id="bodyTable">
        <tr>
            <td align="center" valign="top" id="bodyCell">
                <!-- BEGIN TEMPLATE // -->
                <table border="0" cellpadding="0" cellspacing="0" id="templateContainer">
                    <tr>
                        <td align="center" valign="top">
                            <!-- BEGIN BODY // -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" id="templateBody">
                                <tr>
                                    <td valign="top" class="bodyContent">
                                        <h1>${post.title}</h1>
                                        <h3>in previous chapter...</h3>
                                        ${post.previous}
                                        <br />
                                        <br />
                                        <h2>Excerpt ${post.progress}</h2>
                                        <p>${post.excerpt}</p>
                                    </td>
                                </tr>
                            </table>
                            <!-- // END BODY -->
                        </td>
                    </tr>
                    <tr>
                        <td align="center" valign="top">
                            <!-- BEGIN FOOTER // -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" id="templateFooter">
                                <tr>
                                    <td valign="top" class="footerContent">
                                        Click on <a href="https://leshooflad.leshooflad.workers.dev/rec?lstoken=${post.token}" target="_blank">this link</a> to finish reading this excerpt and schedule the next email.
                                    </td>
                                </tr>
                            </table>
                            <!-- // END FOOTER -->
                        </td>
                    </tr>
                </table>
                <!-- // END TEMPLATE -->
            </td>
        </tr>
    </table>
</center>
</body>
</html>
`;