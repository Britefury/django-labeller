# UEA Computer Vision - Image Labelling Tool

#### A light-weight image labelling tool for Python designed for creating segmentation datasets.

Operates as a browser-based application, either embedded as a widget within [IPython Notebook](http://ipython.org)
or embedded within a web page as part of a web application.

Currently supports simple polygonal labels.


### IPython Notebook widget example

The supplied IPython notebook example creates a labelling tool widget and displays it within the notebook.
API usage is demonstrated further down.

### Flask web app example

An example Flask-based web app is provided that displays the labelling tool within a web page. To start it,
run `python flask_app.py` and open `127.0.0.1:5000` within a browser.


### Libraries, Credits and License

Incorporates the public domain [json2.js](https://github.com/douglascrockford/JSON-js) library.
Uses [d3.js](http://d3js.org/), [jQuery](https://jquery.com/) and [jQuery UI](https://jqueryui.com/).

This software was developed by Geoffrey French at the [School of Computing Sciences](http://www.uea.ac.uk/computing)
at the [University of East Anglia](http://www.uea.ac.uk) as part of a project funded by
[Marine Scotland](http://www.gov.scot/Topics/marine).

It is licensed under the MIT license.


