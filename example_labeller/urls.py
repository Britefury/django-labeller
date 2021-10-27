from django.urls import include, path

from . import views

app_name = 'example_labeller'

urlpatterns = [
    path('', views.home, name='home'),
    path('upload_images', views.upload_images, name='upload_images'),
    path('tool', views.tool, name='tool'),
    path('labelling_tool_api', views.LabellingToolAPI.as_view(), name='labelling_tool_api'),
    path('delete_image', views.delete_image, name='delete_image'),
    path('go_home', views.go_home, name='go_home')
    
]