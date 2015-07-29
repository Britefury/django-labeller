from django.conf.urls import patterns, include, url
from django.contrib import admin
from django.views.generic import RedirectView

urlpatterns = patterns('',
    # Examples:
    # url(r'^$', 'labelling_aas.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^$', 'example_labeller.views.home'),
    url(r'^get_image_descriptor$', 'example_labeller.views.get_image_desctriptor'),
    url(r'^update_labels$', 'example_labeller.views.update_labels'),
    url(r'^image/(?P<image_id>\d+)$', 'example_labeller.views.get_image'),
)
