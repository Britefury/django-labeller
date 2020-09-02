import datetime
from django.test import TestCase
from django.conf import settings
from django.contrib.auth import get_user_model
from . import models

# Create your tests here.
class LabelsMetadataTestCase(TestCase):
    def setUp(self):
        get_user_model().objects.create(username='test_user')
        models.LabellingTask.objects.create(name='test_task1', human_name='Test task 1')
        models.LabellingTask.objects.create(name='test_task2', human_name='Test task 2')

    def test_metadata_dict_to_json(self):
        test_user = get_user_model().objects.get(username='test_user')
        test_task1 = models.LabellingTask.objects.get(name='test_task1')
        test_task2 = models.LabellingTask.objects.get(name='test_task2')

        meta_js = models.Labels.metadata_dict_to_json(dict(creation_date=datetime.date(year=2020, month=2, day=21)))
        self.assertEqual(meta_js['creation_date'], '2020-02-21')

        meta_js = models.Labels.metadata_dict_to_json(dict(last_modified_by=test_user))
        self.assertEqual(meta_js['last_modified_by__username'], 'test_user')
        self.assertEqual(meta_js['last_modified_by__id'], test_user.id)

        meta_js = models.Labels.metadata_dict_to_json(dict(last_modified_datetime=datetime.datetime(
            year=2020, month=2, day=21, hour=16, minute=31, second=5)))
        self.assertEqual(meta_js['last_modified_datetime'], '2020-02-21 16:31:05')

        meta_js = models.Labels.metadata_dict_to_json(dict(completed_tasks=[]))
        self.assertEqual(meta_js['completed_tasks'], [])

        meta_js = models.Labels.metadata_dict_to_json(dict(completed_tasks=[test_task1]))
        self.assertEqual(meta_js['completed_tasks'], ['test_task1'])

        meta_js = models.Labels.metadata_dict_to_json(dict(completed_tasks=[test_task1, test_task2]))
        self.assertEqual(meta_js['completed_tasks'], ['test_task1', 'test_task2'])

    def test_metadata_json_to_dict(self):
        test_user = get_user_model().objects.get(username='test_user')
        test_task1 = models.LabellingTask.objects.get(name='test_task1')
        test_task2 = models.LabellingTask.objects.get(name='test_task2')

        metadata = models.Labels.metadata_json_to_dict(dict(creation_date='2020-02-21'))
        self.assertEqual(metadata['creation_date'], datetime.date(year=2020, month=2, day=21))

        metadata = models.Labels.metadata_json_to_dict(dict(last_modified_by__username='test_user'))
        self.assertEqual(metadata['last_modified_by'], test_user)

        metadata = models.Labels.metadata_json_to_dict(dict(last_modified_by__id=test_user.id))
        self.assertEqual(metadata['last_modified_by'], test_user)

        metadata = models.Labels.metadata_json_to_dict(dict(last_modified_datetime='2020-02-21 16:31:05'))
        self.assertEqual(metadata['last_modified_datetime'], datetime.datetime(
            year=2020, month=2, day=21, hour=16, minute=31, second=5))

        metadata = models.Labels.metadata_json_to_dict(dict(completed_tasks=[]))
        self.assertEqual(metadata['completed_tasks'], [])

        metadata = models.Labels.metadata_json_to_dict(dict(completed_tasks=['test_task1']))
        self.assertEqual(metadata['completed_tasks'], [test_task1])

        metadata = models.Labels.metadata_json_to_dict(dict(completed_tasks=['test_task1', 'test_task2']))
        self.assertEqual(metadata['completed_tasks'], [test_task1, test_task2])

