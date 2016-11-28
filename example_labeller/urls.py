from django.conf.urls import include, url
from django.contrib import admin
from django.views.generic import RedirectView
from . import views

urlpatterns = [
    # Examples:
    # url(r'^$', 'labelling_aas.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^$', views.home),
    url(r'^get_image_descriptor$', views.get_image_desctriptor),
    url(r'^update_labels$', views.set_labels),
    url(r'^image/(?P<image_id>\d+)$', views.get_image),
]
