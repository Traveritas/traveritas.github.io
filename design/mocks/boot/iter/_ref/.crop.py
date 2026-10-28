from PIL import Image
im = Image.open(r"design\mocks\boot\iter\_ref\board\old-vs-new-b.png")
im.crop((0,0,360,886)).save(r"design\mocks\boot\iter\_ref\board\_labels.png")
print(im.crop((0,0,360,886)).size)
