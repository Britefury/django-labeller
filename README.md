# UEA Computer Vision - Image Labelling Tool

#### A light-weight image labelling tool for Python designed for creating segmentation datasets.

Operates as a browser-based application, either embedded as a widget within [Jupyter Notebook](https://jupyter.org/)
or embedded within a web page as part of a web application.

Currently supports simple polygonal labels, box labels, point labels and grouping.


## Installation

From the command line run:

`python setup.py install`

#### Installing Jupyter notebook extensions

Install the Jupyter notebook widget with:

`jupyter nbextension install --py --sys-prefix image_labelling_tool`

Then enable the extension with:

`jupyter nbextension enable --py --sys-prefix image_labelling_tool`


## Examples

### Jupyter Notebook widget example

The supplied Jupyter notebook example `Image labeller notebook.ipynb` creates a labelling tool widget and displays it
within the notebook. API usage is demonstrated further down.

### Flask web app example

An example Flask-based web app is provided that displays the labelling tool within a web page. To start it,
run `python flask_app.py` and open `127.0.0.1:5000` within a browser.

### Django 1.11 web app example

** Not Django 2.x compatible **

The example Django-based web app provides a little more functionality than the Flask app. It stores the label
data in a database (only SQLite in the example) and does basic image locking so that multiple users cannot work
on the same image at the same time.

To initialise, first perform migrations:

```
> python tests/manage.py migrate
```

Then populate the database with the example images in the `images` directory (replace `images` with something
else if you wish to use different images):

```
> python tests/manage.py populate images
```

Then run the app:

```
> python tests/manage.py runserver
```

## API

Please see the Jupyter notebook `Image labeller notebook.ipynb` for API usage.


## Libraries, Credits and License

Incorporates the public domain [json2.js](https://github.com/douglascrockford/JSON-js) library.
Uses [d3.js](http://d3js.org/), [jQuery](https://jquery.com/), [jQuery UI](https://jqueryui.com/)
and [PolyK](http://polyk.ivank.net/).

This software was developed by Geoffrey French in collaboration with Dr. M. Fisher and
Dr. M. Mackiewicz at the [School of Computing Sciences](http://www.uea.ac.uk/computing)
at the [University of East Anglia](http://www.uea.ac.uk) as part of a project funded by
[Marine Scotland](http://www.gov.scot/Topics/marine).

It is licensed under the MIT license.
