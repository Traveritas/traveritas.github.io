# blender -b --factory-startup -P render_seq.py -- OUTDIR [seq ...]
import bpy, sys, os, math
argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
SEQS = argv[1:] or ["wake", "open", "dream", "close"]
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else os.getcwd()
g = {"__name__": "bud"}
exec(open(os.path.join(os.environ["BUD_DIR"], "bud.py"), encoding="utf-8").read(), g)
g["build"]()
sc = bpy.context.scene
sc.cycles.samples = int(os.environ.get("BUD_SAMPLES", "96"))
sc.render.resolution_x = sc.render.resolution_y = int(os.environ.get("BUD_RES", "800"))
sc.render.image_settings.file_format = "PNG"
STEP = 1.5
def ease(x): return x * x * (3 - 2 * x)
plan = {
    "wake":  [(0.0, STEP * f) for f in range(40)],
    "open":  [(ease(f / 39), STEP * f) for f in range(40)],
    "dream": [(1.0, 60 + STEP * f) for f in range(80)],
    "close": [(1 - ease(f / 39), 60 + STEP * f) for f in range(40)],
}
for name in SEQS:
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    for f, (d, ang) in enumerate(plan[name]):
        path = os.path.join(OUT, name, f"{f:03d}.png")
        if os.path.exists(path):
            continue
        g["pose"](d, ang)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print("FRAME", name, f, flush=True)
