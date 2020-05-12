# UEA Computer Vision - Image Labelling Tool

#### A light-weight image labelling tool for Python designed for creating segmentation data sets.

- compatible with Django and Flask
- polygon, box or point annotations supported
- polygonal labels can have disjoint regions and can be editing using paintng and boolean operations; provided by
  [polybooljs](https://github.com/voidqk/polybooljs)
- can use the [DEXTR](http://people.ee.ethz.ch/~cvlsegmentation/dextr/) algorithm to automatically generate
  polygonal outlines of objects identified by the user with a few clicks; provided by the
  [dextr](https://github.com/Britefury/dextr) library


## Installation

From the command line run:

```shell script
> python setup.py install
````

## Examples

### Flask web app example

An example Flask-based web app is provided that displays the labelling tool within a web page. To start it,
run:
 
```shell script
> python flask_app.py
```
Now open `127.0.0.1:5000` within a browser.

#### Flask app with DEXTR assisted labelling

First, install the [dextr](https://github.com/Britefury/dextr) library:

```shell script
> pip install dextr
```

Now tell the Flask app to enable DEXTR:

```shell script
> python flask_app.py --enable_dextr
````
 
The above will use the ResNet-101 based DEXTR model trained on Pascal VOC 2012 that is provided by
the dextr library. 
If you want to use a custom DEXTR model that you trained for your purposes, use the `--dextr_weights` option:

```shell script
> python flask_app.py --dextr_weights=path/to/model.pth
````



### Django 1.11 web app example

** Not Django 2.x compatible **

The example Django-based web app provides a little more functionality than the Flask app. It stores the label
data in a database (only SQLite in the example) and does basic image locking so that multiple users cannot work
on the same image at the same time.

To initialise, first perform migrations:

```shell script
> python tests/manage.py migrate
```

Then populate the database with the example images in the `images` directory (replace `images` with something
else if you wish to use different images):

```shell script
> python tests/manage.py populate images
```

Then run the app:

```shell script
> python tests/manage.py runserver
```

#### Django app with DEXTR assisted labelling

First, install the [dextr](https://github.com/Britefury/dextr) library and [celery](http://www.celeryproject.org/):

```shell script
> pip install dextr
> pip install celery
```

Now install [RabbitMQ](https://www.rabbitmq.com/), using the appropriate approach for your platform (you could use
a different Celery backend if you don't mind editing `settings.py` as needed). 

Enable DEXTR within `tests/example_labeller_app/settings.py`; change the line

```py3
LABELLING_TOOL_DEXTR_AVAILABLE = False
```

so that `LABELLING_TOOL_DEXTR_AVAILABLE` is set to `True`.

You can also change the `LABELLING_TOOL_DEXTR_WEIGHTS_PATH` option to a path to a custom model, otherwise
the default ResNet-101 based U-net trained on Pascal VOC 2012 provided by the dextr library will be used.

Now run the Django application:

```shell script
> cd tests
> python manage.py runserver
```

Now start a celery worker:

```shell script
> cd tests
> celery -A example_labeller_app worker -l info
```

Note that Celery v4 and above are not strictly compatible with Windows, but it can work if you run:
```shell script
> celery -A example_labeller_app worker --pool=solo -l info
```




## API

Please see the Jupyter notebook `Image labeller notebook.ipynb` for API usage.


## Libraries, Credits and License

Incorporates the public domain [json2.js](https://github.com/douglascrockford/JSON-js) library.
Uses [d3.js](http://d3js.org/), [jQuery](https://jquery.com/), [popper.js](https://popper.js.org/),
[PolyK](http://polyk.ivank.net/), [polybooljs](https://github.com/voidqk/polybooljs) and
[Bootstrap 4](https://getbootstrap.com/docs/4.0/getting-started/introduction/).

This software was developed by Geoffrey French in collaboration with Dr. M. Fisher and
Dr. M. Mackiewicz at the [School of Computing Sciences](http://www.uea.ac.uk/computing)
at the [University of East Anglia](http://www.uea.ac.uk) as part of a project funded by
[Marine Scotland](http://www.gov.scot/Topics/marine).

It is licensed under the MIT license.
