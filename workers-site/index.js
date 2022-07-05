import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'
import { deflateSync, inflateSync } from 'zlib'

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

  if (isEmailValid(email)) {
    await SUBSCRIPTIONS.put(hash + ":" + email, "", {
      metadata: { created: Date.now(), progress: "0/" + value },
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


async function processSubscription(item) {

  var meta = item.metadata;

  const progress = meta.progress;

  console.log('processing', item.name, progress);

  var left, right;
  [left, right] = progress.split("/");
  [left, right] = [parseInt(left), parseInt(right)];

  if (left < right) {
    meta.progress = "" + (left + 1) + "/" + right;
    await SUBSCRIPTIONS.put(item.name, "", {
      metadata: meta,
    });
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