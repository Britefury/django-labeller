from django.conf.urls import url

from . import views

urlpatterns = [
    # Examples:
    # url(r'^$', 'labelling_aas.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^$', views.home),
    url(r'^get_labels', views.get_labels),
    url(r'^update_labels$', views.set_labels),
    url(r'^image/(?P<image_id>\d+)$', views.get_image),
]
