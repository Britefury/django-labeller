from django.conf.urls import url

from . import views

urlpatterns = [
    url(r'^$', views.home, name='home'),
    url(r'^upload_images', views.upload_images, name='upload_images'),
    url(r'^tool', views.tool, name='tool'),
    url(r'^labelling_tool_api', views.LabellingToolAPI.as_view(), name='labelling_tool_api'),
]
