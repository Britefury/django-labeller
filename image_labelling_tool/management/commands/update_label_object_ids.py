import os, mimetypes, json, datetime, uuid
from django.core.management.base import BaseCommand, CommandError
from django.core.files import File
from django.db import transaction
from image_labelling_tool import labelling_tool
from image_labelling_tool import models
from ... import models

class Command(BaseCommand):
    help = 'Updates object IDs to use the new UUID based format in label JSON'

    def handle(self, *args, **options):
        # It should be impossible for uuid.uuid4 to generate duplicate UUIDs, but
        # keep track of the ones we've created just in case
        used_uuids = set()
        n_processed = 0
        n_updated = 0
        with transaction.atomic():
            for labels in models.Labels.objects.all():
                labels_js = json.loads(labels.labels_json_str)
                id_prefix = str(uuid.uuid4())
                while id_prefix in used_uuids:
                    id_prefix = str(uuid.uuid4())
                used_uuids.add(id_prefix)
                modified = labelling_tool.ensure_json_object_ids_have_prefix(
                    labels_js, id_prefix=id_prefix)
                if modified:
                    labels.labels_json_str = json.dumps(labels_js)
                    labels.save()
                    n_updated += 1
                n_processed += 1
        print('Updated {}/{} Label models'.format(n_updated, n_processed))
