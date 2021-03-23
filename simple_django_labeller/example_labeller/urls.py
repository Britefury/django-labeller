from django.urls import include, path

from . import views

app_name = 'example_labeller'

urlpatterns = [
    path('', views.home, name='home'),
    path('upload_images', views.upload_images, name='upload_images'),
    path('tool', views.tool, name='tool'),
    path('labelling_tool_api', views.LabellingToolAPI.as_view(), name='labelling_tool_api'),
    path('class_editor', views.class_editor, name='class_editor'),
    path('class_editor_form', views.class_editor_form, name='class_editor_form'),
    path('class_editor_update', views.class_editor_update, name='class_editor_update'),
]
