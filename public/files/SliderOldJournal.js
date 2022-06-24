var img_array = null;
var a_array = null;
var cur_index = 0;
var index = 0;
var delay = 500;

var inProgress = false;

var prev_button = null;
var next_button = null;


function left(){

    if (index < img_array.length-5 && !inProgress){
        inProgress = true;
        index++;
        m = jQuery(".fotos_list").css("margin-left");
        //m = parseInt(m.replace("px",""));
        w = jQuery(".fotos_list li div").outerWidth();
        ww = parseInt(m.replace("px",""))-w;
        jQuery(".fotos_list").animate({"margin-left":ww},delay,function(){
            inProgress = false;
        });
        checkButtons();
    }

}

function right(){

    if (index > 0 && !inProgress){
        inProgress = true;
        index--;
        m = jQuery(".fotos_list").css("margin-left");

        w = jQuery(".fotos_list li div").outerWidth();

        ww = parseInt(m.replace("px",""))+w;

        jQuery(".fotos_list").animate({"margin-left":ww},delay,function(){
            inProgress = false;
        });
        checkButtons();
    }

}

function initSlider(){
    a_array = jQuery(".mag_face_in");

    if (a_array != null && a_array.length>0){
        img_array = jQuery(".mag_face_in");
        checkButtons();
    } else {
        return 0;
    }

}

function checkButtons(){
    if (next_button != null && prev_button != null) {
        if(index > 0) {
            jQuery(prev_button).addClass("active");
        } else {
            jQuery(prev_button).removeClass("active");
        }

        if(index < img_array.length-5){
            jQuery(next_button).addClass("active");
        } else {
            jQuery(next_button).removeClass("active");
        }

    } else {
        next_button = document.getElementById("next_button");
        jQuery(next_button).click(function(){
            left();
        });

        prev_button = document.getElementById("prev_button");
        jQuery(prev_button).click(function(){

            right();
        });

        checkButtons();
    }
}
