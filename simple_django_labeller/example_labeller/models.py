from django.db import models

from image_labelling_tool import models as lt_models
import django.utils.timezone

# Create your models here.
class ImageWithLabels (models.Model):
    # image
    image = models.ImageField(blank=True)

    # labels
    labels = models.ForeignKey(lt_models.Labels, related_name='image')


class DextrTask (models.Model):
    creation_timestamp = models.DateTimeField(default=django.utils.timezone.now)
    image = models.ForeignKey(ImageWithLabels)
    image_id_str = models.CharField(max_length=128)
    dextr_id = models.IntegerField()
    celery_task_id = models.CharField(max_length=128)
