from pydantic import BaseModel
from fastapi import FastAPI, File
from random import randint
from PIL import Image

import uuid
import io


app = FastAPI()

class Model(BaseModel):
    name: str

@app.get('/')
async def root():
    return 'Test API for Django Labeller'

@app.post('/get_labels')
async def get_labels(file: bytes = File(...)):
    image = Image.open(io.BytesIO(file))

    w, h = image.size
    print(f'w:{w}', f'h:{h}')

    labels = []
    for i in range(2):
        labels.append({
            "label_type":"box",
            "label_class":"wall",
            "source":"api",
            "anno_data":{},
            "centre":{
                "x": randint(w // 4, w - (w // 4)),
                "y": randint(h // 4, h - (h // 4))
            },
            "size":{
                "x": w // 4,
                "y": h // 4
            },
            "object_id": str(uuid.uuid4())
        })

    return labels
