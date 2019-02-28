// Entry point for the notebook bundle containing custom model definitions.
//
define([
		'./widget'
	],
	function() {
    "use strict";

    window['requirejs'].config({
        map: {
            '*': {
                "image_labelling_tool": "nbextensions/image_labelling_tool"
            }
        }
    });

    // Export the required load_ipython_extension function
    return {
        load_ipython_extension : function() {}
    };
});
