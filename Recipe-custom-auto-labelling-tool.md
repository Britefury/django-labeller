# Recipe: implementing a custom automatically assisted labelling tool (e.g. similar to DEXTR)

Assume you want to create a new partially automated labelling tool that uses a semantic segmentation
model to perform inference on an image and generate labels from its output. Let's keep things simple by
now requiring and UI/interaction, apart from a button to initiate it.

We will implement it as a button, that results in the the `django-labeller` front-ent sending a request to the
flask server to perform the inference. The server should return the result as a vectorized label in the form of
a list of polygons that form the regions that make up a polygonal label that will be added to the list of labels.

The tool will work as follows:
1. Add a button to the UI that sets the tool off
2. When the button is clicked, send a request to the back-end (Flask server) where the inference will take place
3. The server should convert the predicted mask to vector form and return it to the front-end
4. The front end should create a new label from the vectorized mask


## Step-by-step

### 1. Add the button to the app UI.

In `image_labelling_tool/templates/inline/labeller_app.html`, you will find the comment
`<!-- Edit labels sub-section !-->`. Below this, look for the DEXTR button (its inside a `{%if...%}` Django/Flask
template block):
```html
<button class="btn btn-sm btn-primary w-25 mb-1" type="button" id="dextr_button" data-toggle="tooltip"
                                data-placement="top" title="Automatic polygonal label">AutoP</button>
```

Below this and outside of the `if` block, add your new button:

```html
{% if dextr_available %}
    <button class="btn btn-sm btn-primary w-25 mb-1" type="button" id="dextr_button" data-toggle="tooltip"
        data-placement="top" title="Automatic polygonal label">AutoP</button>
{% endif %}
<!-- New U-net button here !-->
<button class="btn btn-sm btn-primary w-25 mb-1" type="button" id="unet_button" data-toggle="tooltip"
    data-placement="top" title="Unet labelling algo">Unet</button>
```

### 2. Handle the button click event in the front-end

The `django-labeller` front-end is designed for flexibility, so it communicates with the outside via callbacks.
It is up to those callbacks to communicate with the backend via HTTP POST, web sockets, Qt web channels or whichever
channel is desired.

We must:
- Add a field to the `DjangoLabeller` class in `image_labelling_tool/static/labelling_tool/main_labeller.ts` to
  store the callback that `DjangoLabeller` will invoke to request inference
- Add a parameter to the `DjangoLabeller` constructor to receive the callback
- Respond to our buttons' click event by invoking the callback 
- Implement the callback such that it requests an inference from the server

#### Modify `DjangoLabeller` so that it takes another callback

Add the field to the `DjangoLabeller` class, around the same location as the DEXTR fields, e.g. something like:

```typescript
private _dextrCallback: any; 
private _dextrPollingInterval: number;
private _unetCallback: any;   // Our new field
private _image_initialised: boolean; 
```

Lets add it to the constructor:

```typescript
constructor(schema: LabellingSchemaJSON, tasks: TasksJSON[],
                    anno_controls_json: AnnoControlJSON[],
                    images: ImageModel[], initial_image_index: number,
                    requestLabelsCallback: any, sendLabelHeaderFn: any,
                    getUnlockedImageIDCallback: any, dextrCallback: any, dextrPollingInterval: number,
                    unetCallback: any, // Our new parameter
                    config: any) {});
```

Within the constructor, assign it to our field:

```typescript
// Dextr label request callback; labelling tool will call this when it needs a new image to show
this._dextrCallback = dextrCallback;
// Dextr pooling interval
this._dextrPollingInterval = dextrPollingInterval;
// Assign our new callback
this._unetCallback = unetCallback;
```

#### Handle the button click event

Below the code that we use to handle the DEXTR button, lets handle our button (note that we implement
the `on_unet_response` function in a later step):

```typescript
if (dextrCallback !== null) {
    var draw_dextr_button: any = $('#dextr_button');
    draw_dextr_button.click(function (event: any) {
        self.set_current_tool(new DextrTool(self.root_view));
        event.preventDefault();
    });
}

if (self._unetCallback !== null) {
    var on_unet_response = function(unet_nresult) {
        // In this function, we create the label
        // We implement this later on....
        alert("Not implemented yet!!!");
    }
    // Get the button that we added to the app template
    var unet_button: any = $('#unet_button');
    // Respond to the click event
    unet_button.click(function (event: any) {
        // Get the ID of the image that the user has currently selected
        var image_id = self._get_current_image_id();
        // invoke the U-net callback
        self._unetCallback(image_id, on_unet_response);
        event.preventDefault();
    });
}
```

#### Implement the callback

We will implement the callback in only the Flask template for now. The DEXTR callback is implemented as follows
within `image_labelling_tool/templates/labeller_page.jinja2`:

```typescript
{% if dextr_available %} 
                 // set labels callback function 
                 var dextr_request = function(dextr_request) { 
                     // Create the POST data 
                     var post_data = { 
                         dextr: JSON.stringify(dextr_request) 
                     }; 
  
                     $.ajax({ 
                         type: 'POST', 
                         url: '/labelling/dextr', 
                         data: post_data, 
                         success: function(msg) { 
                             if (msg.labels !== undefined) { 
                                 tool.dextrSuccess(msg.labels); 
                             } 
                         }, 
                         dataType: 'json' 
                     }); 
                 }; 
             {% else %} 
                 var dextr_request = null; 
             {% endif %} 
```

Below this, create our callback:

```typescript
// U-net callback function
// Note that our parameters -- the image ID and a callback that is invoked when the server replies -- are the parameters
var unet_callback = function(image_id, on_response) { 
   // Create the POST data that provides the image ID
   var post_data = { 
       image_id: image_id 
   }; 

   // Send request to server
   $.ajax({ 
       type: 'POST', 
       url: '/labelling/unet', 
       data: post_data, 
       success: function(msg) { 
           // The server has replied; if the message has a `unet` attribute, invoke `on_response` that
           // is a function passed to us by DjangoLabeller. DjangoLabeller will pass
           // the `on_unet_response` function above as this parameter.
           if (msg.unet !== undefined) {
               on_response(msg.unet);
           }
       }, 
       dataType: 'json'
   }); 
}; 
```

The constructor of the `DjangoLabeller` class is invoked futher down; pass `unet_callback` to it:

```javascript
         // Create the labelling tool 
         // Give it: label classes, dimensions, image descriptors, initial image ID and the callbacks above 
             var tool = new labelling_tool.DjangoLabeller( 
                 {{ labelling_schema | tojson | safe }}, 
                 {{ tasks | tojson | safe }}, 
                 {{ anno_controls | tojson | safe }}, 
                 {{ image_descriptors | tojson | safe }}, 
                 {{ initial_image_index | safe }}, 
                 get_labels, 
                 set_labels, 
                 null, 
                 dextr_request, 
                 null,
                 unet_callback,   // Pass our callback to DjangoLabller constructor
                 {{ labelling_tool_config | tojson | safe }} 
             ); 
```

### 3. Perform inference on the server

Handle the `/labelling/unet` URL in the Flask server by adding a new view to `image_labelling_tool/flask_labeller.py`.
Lets look at the DEXTR implementation first for reference:

```python
@app.route('/labeller/dextr', methods=['POST'])
def dextr():
    dextr_js = json.loads(request.form['dextr'])
    if 'request' in dextr_js:
        dextr_request_js = dextr_js['request']
        image_id = dextr_request_js['image_id']
        dextr_id = dextr_request_js['dextr_id']
        dextr_points = dextr_request_js['dextr_points']

        image = images_table[image_id]
        regions_js = apply_dextr_js(image, dextr_points)

        dextr_labels = dict(image_id=image_id, dextr_id=dextr_id, regions=regions_js)
        dextr_reply = dict(labels=[dextr_labels])

        return make_response(json.dumps(dextr_reply))
    elif 'poll' in dextr_js:
        dextr_reply = dict(labels=[])
        return make_response(json.dumps(dextr_reply))
    else:
        return make_response(json.dumps({'error': 'unknown_command'}))
```

Following the above, here is our handler:

```python
@app.route('/labelling/unet', methods=['POST'])
def unet():
    image_id = request.form['image_id']
    image = images_table[image_id]
    regions_js = apply_unet_js(image) # Not yet implemented
    unet_response = dict(image_id=image_id, unet=dict(regions=regions_js))
    return make_response(json.dumps(unet_response))
```

Now we need to implement the `apply_unet_js` function. Lets look at `apply_dextr_js` for reference:

```python
def apply_dextr_js(image: labelled_image.LabelledImage, dextr_points_js: Any):
    image_for_dextr = image.image_source.image_as_array_or_pil()
    dextr_points = np.array([[p['y'], p['x']] for p in dextr_points_js])
    if dextr_fn is not None:
        mask = dextr_fn(image_for_dextr, dextr_points)
        regions = labelling_tool.PolygonLabel.mask_image_to_regions_cv(mask, sort_decreasing_area=True)
        regions_js = labelling_tool.PolygonLabel.regions_to_json(regions)
        return regions_js
    else:
        return []
```

Adapting it for U-net:

```python
def apply_unet_js(image: labelled_image.LabelledImage):
    image_for_unet = image.image_source.image_as_array_or_pil()
    mask = unet_fn(image_for_unet)
    regions = labelling_tool.PolygonLabel.mask_image_to_regions_cv(mask, sort_decreasing_area=True)
    regions_js = labelling_tool.PolygonLabel.regions_to_json(regions)
    return regions_js
```

Note that it needs a callable `unet_fn` that will perform the inference and return a mask, where the mask
is a NumPy array with `dtype=bool`.

### 4. Generate the label in the front-end when the server replies

Lets implement the `on_unet_response` function that we left empty earlier:

```typescript
var on_unet_response = function(unet_nresult) {
    // Handle the U-net result
    // First, ensure that the user hasn't switched images between sending the request and the server replying:
    // (note above that the server includes the image ID in its response)
    if (unet_result.image_id === self._get_current_image_id()) {
        // Let's assume that the result consists of a JSON object whose 'regions' attribute is an nested array of points.
        if (unet_result.regions !== undefined && unet_result.regions.length > 0) {
            // Create a new polygonal label model.
            // We use the currently selected label class.
            // We pass "auto:unet" to the source parameter, indicating that it was automatically generated using a U-net
            var model = new_PolygonalLabelModel(self.get_label_class_for_new_label(), "auto:unet");
            // Set the regions of the new label model
            model.regions = unet_result.regions;
            // Create the visible and interactive entity for the new label
            var entity = self.root_view.get_or_create_entity_for_model(model);
            // Add it to the view
            self.root_view.add_child(entity);
            // Make it the currently selected entity
            self.root_view.select_entity(entity, false, false);
        }
    }
}
```

Hopefully that's it.