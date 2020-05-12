from celery import shared_task

import numpy as np

from image_labelling_tool import labelling_tool

from django.conf import settings


_dextr_model = None

def _apply_dextr(image_path, dextr_points_np):
    global _dextr_model
    if settings.LABELLING_TOOL_DEXTR_AVAILABLE or settings.LABELLING_TOOL_DEXTR_WEIGHTS_PATH is not None:
        if _dextr_model is None:
            import os
            from dextr.model import DextrModel
            import torch

            device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

            if settings.LABELLING_TOOL_DEXTR_WEIGHTS_PATH is not None:
                dextr_weights = os.path.expanduser(settings.LABELLING_TOOL_DEXTR_WEIGHTS_PATH)
                dextr_model = torch.load(dextr_weights, map_location=device)
            else:
                dextr_model = DextrModel.pascalvoc_resunet101().to(device)

            dextr_model.eval()

            _dextr_model = dextr_model

        import numpy as np
        from PIL import Image

        im = Image.open(image_path)

        mask = _dextr_model.predict([im], dextr_points_np[None, :, ::-1])[0] >= 0.5
        regions = labelling_tool.PolygonLabel.mask_image_to_regions_cv(mask, sort_decreasing_area=True)
        regions_js = labelling_tool.PolygonLabel.regions_to_json(regions)
        return regions_js
    else:
        return None


@shared_task
def test_task(a, b):
    return a + b

@shared_task
def dextr(image_path, dextr_points_js):
    dextr_points = np.array([[p['x'], p['y']] for p in dextr_points_js])
    regions_js = _apply_dextr(image_path, dextr_points)
    return regions_js
