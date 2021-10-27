import json
from example_labeller.models import ImageWithLabels

def export_labels():
    images = ImageWithLabels.objects.all()
    for im in images:
        if im.labels.completed_tasks.filter(human_name__contains = 'export'):
            json_name = f'{im.image.name[:-4]}__labels.json'
            print(json_name)
            json_content = {'image_filename': im.image.name[:-4],
                            'complete': True}
            json_content['labels'] = im.labels.labels_json
            with open(json_name, 'w') as jsonFile:
                json.dump(json_content, jsonFile, indent=4)