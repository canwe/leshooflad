/**
 * Created with JetBrains PhpStorm.
 * User: anton
 * Date: 10.08.12
 * Time: 19:05
 * To change this template use File | Settings | File Templates.
 */

/*
работа с корзиной начало



var pop_bg = null;
var pop_dialog = null;
var pop_dialog_bg = null;
var pop_close = null;
var div_content = null;

function openPopup() {
    if(!pop_bg){
        pop_bg = document.createElement("div");
        // задний фон
        $(pop_bg).attr("id","pop_bg").css("display","none");
        $(document.body).append(pop_bg);

        // контейнер  для окошка
        pop_dialog_bg = document.createElement("div");
        $(pop_dialog_bg).addClass("pop_dialog_bg");


        // окошечко
        pop_dialog = document.createElement("div");
        $(pop_dialog).attr("id","pop_dialog").css("display","none");

        div_content = document.createElement("div");
        $.post("https://lebigmag.ru/personal/cart/index.php",function(data)
        {
            $(div_content).append(data);
        });

        $(pop_dialog).append(div_content);
        $(pop_dialog_bg).append(pop_dialog);
        $(document.body).prepend(pop_dialog_bg);

        $(pop_bg).fadeTo(500,0.5,function(){
            $(pop_dialog).fadeTo(500,1);
        });
        //window.onresize = onResize;

    }
}

function closePopup(){
    $(pop_dialog).fadeTo(500,0);
    $(pop_bg).fadeTo(500,0,function(){
        $(pop_dialog).remove();
        $(pop_dialog_bg).remove();
        $(pop_bg).remove();
        pop_dialog = null;
        pop_bg = null;
        pop_close = null;
    });

    location.reload(true);
    //window.onresize = null;
}


function Update (){

    p_div_content = document.createElement("div");
    $.post("https://lebigmag.ru/personal/cart/index.php",function(data)
    {
        $(p_div_content).append(data);
        $(p_div_content).removeClass('free_mags');
    });

    $(pop_dialog).fadeTo(500,0.7,function(){
        $(div_content).remove();
        div_content = null;
        div_content = p_div_content;
        $(pop_dialog).append(div_content);
    });

    $(pop_dialog).fadeTo(500,1);
}


function updateCount(elementID, mode){

    var count=0.0;

    elementID = "QUANTITY_"+elementID;

    // выбрать все элементы span с количеством товара
    var a_array = jQuery(".basket_kol");
    // пройтись циклом если  массив существует и больше 0
    if (a_array != null && a_array.length>0){


        var array_post={};

        a_array.each(function(item){

            // выбираем ID товарова
            var id = a_array[item].id;


            // находим этот эелемент
            var elem = document.getElementById(id);


            // выбираем выбираем у этого элемента значение
            count = parseFloat(elem.innerHTML);

            // если  нажата кнопка элемента который в данный момент проходит по циклу то
            // увеличить  или  уменьшить количество
            // иначе просто добавить в строку запроса
            if(id == elementID)
            {
                // если нажал пользователь  +
                if (mode == "plus")
                {
                    count = count+1.00;
                }
                // если  пользователь нажал  минус
                else if (mode == "minus"){
                    count = count-1.00;
                }
            }
            array_post[elem.id] = count;

        });
        array_post["BasketRefresh"] = "Пересчитать";
    }


    p_div_content = document.createElement("div");
    $.post("https://lebigmag.ru/personal/cart/index.php",array_post,function(data)
    {
        $(p_div_content).append(data);
    });


    $(pop_dialog).fadeTo(700,0.75,function(){
        $(div_content).remove();
        div_content = null;
        div_content = p_div_content;
        $(pop_dialog).append(div_content);
    });

    $(pop_dialog).fadeTo(700,1);

}




function basketBut() {

    p_div_content = document.createElement("div");

    // выбрать все элементы span с количеством товара
    var a_array = jQuery(".basket_kol");
    // пройтись циклом если  массив существует и больше 0
    if (a_array != null) {
        if (a_array.length > 0) {

            var array_post = {};

            a_array.each(function (item) {
                // выбираем ID товарова
                var id = a_array[item].id;
                // находим этот эелемент
                var elem = document.getElementById(id);
                // выбираем выбираем у этого элемента значение
                count = parseFloat(elem.innerHTML);

                array_post[elem.id] = count;
            });
            array_post["BasketOrder"] = "Оформить заказ";
        }
    }

    $.post("https://lebigmag.ru/personal/cart/index.php", array_post);

    $.post("https://lebigmag.ru/personal/order/make/index.php", function (data) {
        $(p_div_content).append(data);
    });

    $(pop_dialog).fadeTo(500, 0.7, function () {
        $(div_content).remove();
        div_content = null;
        div_content = p_div_content;
        $(pop_dialog).append(div_content);
    });

    $(pop_dialog).fadeTo(500, 1);




}


function onResize(){
    if(pop_bg){
        $(pop_bg).width($(window).width());
        $(pop_bg).height($(window).height());
    }
}

 работа с корзиной конец
 */


/*
 Слайдер советов начало
 */
/*
var tips_array = null;
var a_array = null;
var delay = 3000;
var delayTips = 10000;


var disk = setInterval(top, delayTips);

function top() {
    if(tips_array!=null){

        m=jQuery(".tips_list").css("margin-top");

        w = jQuery(".tips_list li").outerHeight();

        ww = parseInt(m.replace("px", "")) - w;

        jQuery(".tips_list").animate({"margin-top":ww}, delay,"swing", function () {

            jQuery(".tips_list").removeAttr("style");

            first = tips_array[0];

            tips_array.splice(0,1);
            // поставить первы элемент массива в конец массива
            //tips_array.splice(tips_array.length,0,first);
            tips_array.push(first);

            // удалить  из html первый элемент списка
            jQuery(".tips_list li:first-child").remove();

            // добавить в html удалённый элемент в конец списка
            // что бы получить  циклический список
            jQuery('.tips_list').append(first);


        });
    }else
    {
        initTips();
    }

}

function topClick()
{
    delay = 100;
    top();
    clearInterval(disk);
    disk = setInterval(top, delayTips);
}

function outClick()
{
    delay = 3000;
}

function initTips() {
    a_array = jQuery(".top_pod");

    if (a_array != null && a_array.length > 0) {
        tips_array = jQuery(".tips_list li");

    } else {

        return 0;
    }

}

function startTimer() {
    delayTips = 1000;
}

function stopTimer() {

    delayTips = 0;
}




 Слайдер советов конец
 */
/*
 Фильтр по  алфавиту начало
 */



function alphabet_filter(alphabet, element)
{
    $.post("https://lebigmag.ru/mags/alphabet_filter.php",{"alphabet": alphabet},function(data)
    {

        var content = $(data).find("#insert_mag").html();
        $("#mags").empty().append(content);
    });


    var old_buk = $(".usa_alphabet .active").children().html();

    var str = ' <a name="set_filter" onclick="alphabet_filter('+"'"+old_buk+"'" +',this)">' + old_buk + '</a>';
    $(".usa_alphabet .active").html(str);
    $(".usa_alphabet .active").removeClass("active");



    var html = $(element).html();
    var parent  = $(element).parent();

    $(parent).html('<span>'+html+'</span>');
    $(parent).addClass("active");

    //var left_menu_active =
    checkMenu();

}
/*
 Фильтр по  алфавиту конец
 */


function checkMenu()
{
    var element = $(".div_menu_active");
    if(element.length!=0)
    {
        $(".div_menu_active").remove();
        $(".left_menu_active").parent().attr("style","");
        var atr = $(".left_menu_active").attr("uri");
        $(".left_menu_active").before("<a class='left_menu' href=' " +atr+"'>"+$(".left_menu_active").html()+"</a>");
        $(".left_menu_active").remove();

        var par = $("#all_journal").parent();
        $("#all_journal").remove();
        par.css("position", "relative");
        par.html('<div style="position:absolute; top:5px; left:-14px;"> <img src="/bitrix/templates/lebigmag/img/bull.gif" border=0></div> <span id="all_journal" class="left_menu_active">all titles</span>&nbsp;');

    }

}

function replaceSearch()
{
    var par = $("#a_search").parent();
    var action =$("#a_search").parent().attr('form_action');
    var id = $("#a_search").parent().attr('input_id');
    $("#a_search").remove();
    var form = document.createElement("form");
    $(form).attr({"id":"form_search", "action":action});
    var input = document.createElement("input");
    $(input).attr({"type":"text", "height":"24", "id":id,"name":"q","value":"","autocomplete":"off"}).addClass("topsearch").blur(function(){
        replaceSearchBlur();
    }).focus(function(){
            if(this.value == 'search') this.value = '';
        });
    $(form).append(input);
    $(par).append(form);
    $(input).focus();
}
function replaceSearchBlur()
{
     var par = $("#form_search").parent();
    $("#form_search").remove();
    var uri = document.createElement("a");
    $(uri).attr({"id":"a_search"}).addClass("mainmenu_search").click(function(){
        javascript:replaceSearch();
    });
    $(uri).html("search");
    par.append(uri);

}
