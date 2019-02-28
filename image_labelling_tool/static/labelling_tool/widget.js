// requirejs.config({
//     shim: {
//         'nbextensions/image_labelling_tool/labelling_tool/abstract_label': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/abstract_tool': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/box_label': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_tool',
//             'nbextensions/image_labelling_tool/labelling_tool/select_tools',
//             'nbextensions/image_labelling_tool/labelling_tool/root_label_view'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/composite_label': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/group_label': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/label_class': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/main_tool': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/object_id_table',
//             'nbextensions/image_labelling_tool/labelling_tool/label_class',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_tool',
//             'nbextensions/image_labelling_tool/labelling_tool/select_tools',
//             'nbextensions/image_labelling_tool/labelling_tool/point_label',
//             'nbextensions/image_labelling_tool/labelling_tool/box_label',
//             'nbextensions/image_labelling_tool/labelling_tool/polygonal_label',
//             'nbextensions/image_labelling_tool/labelling_tool/composite_label',
//             'nbextensions/image_labelling_tool/labelling_tool/group_label'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/math_primitives': {exports: 'labelling_tool', deps: [] },
//         'nbextensions/image_labelling_tool/labelling_tool/object_id_table': {exports: 'labelling_tool', deps: [] },
//         'nbextensions/image_labelling_tool/labelling_tool/point_label': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_tool',
//             'nbextensions/image_labelling_tool/labelling_tool/select_tools',
//             'nbextensions/image_labelling_tool/labelling_tool/root_label_view'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/polygonal_label': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_tool',
//             'nbextensions/image_labelling_tool/labelling_tool/select_tools'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/root_label_view': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/object_id_table',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label',
//             'nbextensions/image_labelling_tool/labelling_tool/composite_label',
//             'nbextensions/image_labelling_tool/labelling_tool/group_label',
//             'nbextensions/image_labelling_tool/labelling_tool/main_tool'
//             ] },
//         'nbextensions/image_labelling_tool/labelling_tool/select_tools': {exports: 'labelling_tool', deps: [
//             'nbextensions/image_labelling_tool/labelling_tool/math_primitives',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_label',
//             'nbextensions/image_labelling_tool/labelling_tool/abstract_tool'
//             ] }
//     }
// });

define('image-labelling-tool',
       ["@jupyter-widgets/base",
        "nbextensions/image_labelling_tool/d3.min",
        "nbextensions/image_labelling_tool/json2",
        "nbextensions/image_labelling_tool/polyk",
        "nbextensions/image_labelling_tool/labelling_tool/math_primitives",
        "nbextensions/image_labelling_tool/labelling_tool/abstract_label",
        "nbextensions/image_labelling_tool/labelling_tool/abstract_tool",
        "nbextensions/image_labelling_tool/labelling_tool/box_label",
        "nbextensions/image_labelling_tool/labelling_tool/composite_label",
        "nbextensions/image_labelling_tool/labelling_tool/group_label",
        "nbextensions/image_labelling_tool/labelling_tool/label_class",
        "nbextensions/image_labelling_tool/labelling_tool/main_tool",
        "nbextensions/image_labelling_tool/labelling_tool/object_id_table",
        "nbextensions/image_labelling_tool/labelling_tool/point_label",
        "nbextensions/image_labelling_tool/labelling_tool/polygonal_label",
        "nbextensions/image_labelling_tool/labelling_tool/root_label_view",
        "nbextensions/image_labelling_tool/labelling_tool/select_tools"
        ],
       function(widget, manager){
    /*
    Labeling tool view; links to the server side data structures
     */
    var ImageLabellingToolView = widget.DOMWidgetView.extend({
        render: function() {
            var self = this;

            // Register a custom IPython widget message handler for receiving messages from the Kernel
            this.model.on('msg:custom', this._on_custom_msg, this);


            // Get label classes, tool dimensions, and image ID set and initial image ID from the kernel
            var label_classes = self.model.get("label_classes");
            var tool_width = self.model.get("tool_width_");
            var tool_height = self.model.get("tool_height_");
            var images = self.model.get('images_');
            var initial_image_index = self.model.get('initial_image_index_');
            var config = self.model.get('labelling_tool_config_');

            console.log("Labelling tool config:");
            console.log(config);


            // Callback function to allow the labelling tool to request an image
            var get_labels = function(image_id_str) {
                // Send a 'request_image_descriptor' message to the kernel requesting the
                // image identified by `image_id_str`
                self.send({msg_type: 'get_labels', image_id: image_id_str});
            };

            // Callback function to allow the labelling tool to send modified label data to the kernel
            var update_labels = function(label_header) {
                // Send a 'label_header' message to the kernel, along with modified label data
                self.send({msg_type: 'update_labels', label_header: label_header});
            };

            // Create the labelling tool
            // Place it into the widget element (`this.$el`).
            // Also give it the label classes, tool dimensions, image ID set, initial image ID and the callbacks above
            self._labeling_tool = new labelling_tool.LabellingTool(this.$el, label_classes, tool_width, tool_height,
                                                                   images, initial_image_index,
                                                                   get_labels, update_labels, null,
                                                                   config);
        },


        _on_custom_msg: function(msg) {
            // Received a custom message from the kernel
            if (msg.msg_type === "load_labels") {
                // 'load_labels' message
                var label_header = msg.label_header;
                var image = msg.image;
                // Send labels to labelling tool
                this._labeling_tool.loadLabels(label_header, image);
            }
        }
    });

    // Register the ImageLabelingToolView with the IPython widget manager.
//     manager.WidgetManager.register_widget_view('ImageLabellingToolView', ImageLabellingToolView);
    console.log("Defined ImageLabellingToolView");

    return {
        'ImageLabellingToolView': ImageLabellingToolView
    };
});