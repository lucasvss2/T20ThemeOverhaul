"""Apply supplied campaign tokens and frame the remaining original Bestiary art.

Usage: python scripts/apply-bestiario-tokens.py "path/to/Tokens"
Pillow is required. Originals and input PNGs are never modified.
"""
from pathlib import Path
from math import hypot
from urllib.parse import unquote
from hashlib import sha256
import argparse
import json
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"scripts/data/bestiario-token-images.json"
PACK=ROOT/"packs-src/bestiario-de-arton"
ASSETS=ROOT/"public/assets/bestiario-de-arton/tokens"
PREFIX="modules/t20-theme-overhaul/"
SIZE=600

def frame_from(reference):
    image=Image.open(reference).convert("RGBA").resize((SIZE,SIZE),Image.Resampling.LANCZOS)
    frame=Image.new("RGBA",(SIZE,SIZE))
    draw=ImageDraw.Draw(frame)
    # Reconstruct the uninterrupted dark red backing. The supplied texture and
    # thorns are copied over it; no creature pixels from the reference are used.
    draw.ellipse((12,12,588,588),fill=(57,7,9,255))
    draw.ellipse((47,47,553,553),fill=(0,0,0,0))
    src=image.load();dst=frame.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r,g,b,a=src[x,y]
            radius=hypot(x-(SIZE-1)/2,y-(SIZE-1)/2)
            if radius < 253:
                dst[x,y]=(0,0,0,0)
            elif a and ((r>g*1.8 and r>b*1.8 and r>20) or (max(r,g,b)<30 and radius<302)):
                dst[x,y]=(r,g,b,a)
    return frame

def frame_art(original,frame):
    art=Image.open(original).convert("RGBA")
    # Fit the complete source image rather than zooming into a newly generated
    # portrait. Only the circular token clipping and frame change its display.
    inner=ImageOps.pad(art,(508,508),method=Image.Resampling.LANCZOS,color=(24,24,29,255),centering=(0.5,0.5))
    canvas=Image.new("RGBA",(SIZE,SIZE),(24,24,29,255))
    canvas.alpha_composite(inner,(46,46))
    circle=Image.new("L",(SIZE*3,SIZE*3))
    ImageDraw.Draw(circle).ellipse((46*3,46*3,554*3,554*3),fill=255)
    canvas.putalpha(circle.resize((SIZE,SIZE),Image.Resampling.LANCZOS))
    canvas.alpha_composite(frame)
    # Clear RGB outside the alpha mask to avoid colored halos in GPU mipmaps.
    pixels=canvas.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if pixels[x,y][3]==0:
                pixels[x,y]=(0,0,0,0)
    return canvas

def source_path(url):
    if not url.startswith(PREFIX):
        raise ValueError("Unexpected original image location: "+url)
    result=(ROOT/"public"/unquote(url[len(PREFIX):])).resolve()
    if not result.is_relative_to((ROOT/"public").resolve()):
        raise ValueError("Image escaped public directory.")
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tokens",type=Path)
    args=parser.parse_args()
    data=json.loads(DATA.read_text(encoding="utf-8"))
    if len(data["mappings"]) != 181:
        raise ValueError("Expected all 181 Bestiary actors.")
    ASSETS.mkdir(parents=True,exist_ok=True)
    frame=frame_from(args.tokens/data["frameReference"])
    frame.save(ASSETS/"token-frame.png",optimize=True)
    result=[]
    for entry in data["mappings"]:
        file=PACK/entry["document"]
        doc=json.loads(file.read_text(encoding="utf-8"))
        if doc["_id"]!=entry["id"] or doc["name"]!=entry["name"]:
            raise ValueError("Actor identity changed: "+entry["name"])
        output=ASSETS/entry["asset"]
        if entry["providedToken"]:
            src=args.tokens/entry["providedToken"]
            if src.parent.resolve()!=args.tokens.resolve():
                raise ValueError("Invalid input path.")
            with Image.open(src) as image:
                image.verify()
            binary=src.read_bytes()
            output.write_bytes(binary)
            if sha256(output.read_bytes()).digest()!=sha256(binary).digest():
                raise ValueError("Input token was not copied exactly.")
        else:
            original=source_path(entry["originalPortrait"])
            before=sha256(original.read_bytes()).hexdigest()
            frame_art(original,frame).save(output,optimize=True)
            if sha256(original.read_bytes()).hexdigest()!=before:
                raise ValueError("Original art changed.")
        url=PREFIX+"assets/bestiario-de-arton/tokens/"+entry["asset"]
        doc["img"]=url
        doc["prototypeToken"]["texture"]["src"]=url
        file.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        with Image.open(output) as image:
            image.verify()
        result.append(dict(id=entry["id"],name=entry["name"],image=url,method=entry["method"]))
    print(json.dumps(dict(actors=len(result),provided=sum(x["method"]=="provided" for x in result),framed=sum(x["method"]=="frame-original" for x in result)),ensure_ascii=False))
    (ASSETS/"manifest.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

if __name__=="__main__":
    main()
