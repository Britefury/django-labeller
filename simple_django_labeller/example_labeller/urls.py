from django.urls import include, path

from . import views

app_name = 'example_labeller'

urlpatterns = [
    path('', views.home, name='home'),
    path('upload_images', views.upload_images, name='upload_images'),
    path('tool', views.tool, name='tool'),
    path('labelling_tool_api', views.LabellingToolAPI.as_view(), name='labelling_tool_api'),
    path('schema_editor', views.schema_editor, name='schema_editor'),
    path('schema_editor_api', views.SchemaEditorAPI.as_view(), name='schema_editor_api'),
    path('get_api_labels/<int:image_id>', views.get_api_labels, name='get_api_labels'),
]
