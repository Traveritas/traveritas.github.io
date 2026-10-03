# 晶苞 · 六方双锥冰晶 → 三长三短绽开
# 用法：exec 后调用 build()，再 pose(dream, angle_deg)
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion

N = 6
R = 0.62      # 赤道半径
TOP = 1.32    # 上顶点
BOT = -0.92   # 下顶点
GAP = 0.010   # 楔块之间的解理缝

PIECES = []   # (obj, hinge_point, hinge_axis, kind, idx)
SHARDS = []
CORE = None
ROOT = None


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def eq(i):
    a = 2 * math.pi * i / N
    return Vector((R * math.cos(a), R * math.sin(a), 0.0))


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def principled(mat):
    mat.use_nodes = True
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def make_materials():
    clear = bpy.data.materials.new("bud_clear")
    b = principled(clear)
    b.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.015
    b.inputs["IOR"].default_value = 1.47
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Thin Film Thickness"].default_value = 420.0
    b.inputs["Thin Film IOR"].default_value = 1.33
    b.inputs["Coat Weight"].default_value = 0.0

    frost = bpy.data.materials.new("bud_frost")
    b = principled(frost)
    b.inputs["Base Color"].default_value = (0.86, 0.84, 0.86, 1)
    b.inputs["Roughness"].default_value = 0.30
    b.inputs["IOR"].default_value = 1.47
    b.inputs["Transmission Weight"].default_value = 1.0

    # 晶核：一团发光雾（体积，不与玻璃界面打架）
    core = bpy.data.materials.new("bud_core")
    core.use_nodes = True
    nt = core.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (1.0, 0.86, 0.78, 1)
    vol.inputs["Density"].default_value = 2.0
    vol.inputs["Emission Color"].default_value = (1.0, 0.72, 0.42, 1)
    vol.inputs["Emission Strength"].default_value = 0.6
    # 球形衰减
    tc = nt.nodes.new("ShaderNodeTexCoord")
    ln = nt.nodes.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 1.0
    mr.inputs["From Max"].default_value = 0.0
    mr.inputs["To Min"].default_value = 0.0
    mr.inputs["To Max"].default_value = 1.0
    pw = nt.nodes.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 2.2
    md = nt.nodes.new("ShaderNodeMath"); md.operation = "MULTIPLY"; md.inputs[1].default_value = 3.0
    nt.links.new(tc.outputs["Object"], ln.inputs[0])
    nt.links.new(ln.outputs["Value"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], pw.inputs[0])
    nt.links.new(pw.outputs["Value"], md.inputs[0])
    nt.links.new(md.outputs["Value"], vol.inputs["Density"])
    em = nt.nodes.new("ShaderNodeMath"); em.operation = "MULTIPLY"; em.inputs[1].default_value = 0.6
    em.name = "core_emit"
    nt.links.new(pw.outputs["Value"], em.inputs[0])
    nt.links.new(em.outputs["Value"], vol.inputs["Emission Strength"])
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    return clear, frost, core


def tetra(name, pts, outer_face, mats):
    """pts: 4 个顶点；outer_face: 属于双锥外表面的那张面的顶点下标三元组"""
    c = sum(pts, Vector()) / 4
    pts = [p + (c - p).normalized() * GAP for p in pts]
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    faces = [(0, 1, 2), (0, 1, 3), (0, 2, 3), (1, 2, 3)]
    for f in faces:
        face = bm.faces.new([vs[k] for k in f])
        face.material_index = 0 if set(f) == set(outer_face) else 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for m in mats:
        ob.data.materials.append(m)
    bev = ob.modifiers.new("bevel", "BEVEL")
    bev.width = 0.014
    bev.segments = 3
    bev.harden_normals = False
    return ob


THICK = 0.075


def plate(name, tri, mats):
    """细分三角板（局部坐标：原点=铰链中点，X=铰链方向，Y=外法向，Z=指向尖端）
    外表面清透、内表面微糙、侧边磨砂；SimpleDeform 负责梦面瓣尖外卷"""
    apex, v0, v1 = tri
    mid = (v0 + v1) / 2
    X = (v1 - v0).normalized()
    Z = apex - mid
    Z = (Z - X * Z.dot(X)).normalized()
    cen = (apex + v0 + v1) / 3
    Y = Z.cross(X)
    if Y.dot(cen) < 0:
        X = -X
        Y = Z.cross(X)
    half = (v1 - v0).length / 2 * 0.965
    L = (apex - mid).length * 0.975
    K, M = 14, 4
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for k in range(K):
        h = k / K
        w = half * (1 - h)
        rows.append([bm.verts.new((-w + 2 * w * m / M, 0.0, h * L + GAP * 1.5)) for m in range(M + 1)])
    top = bm.verts.new((0.0, 0.0, L))
    for k in range(K - 1):
        for m in range(M):
            bm.faces.new([rows[k][m], rows[k][m + 1], rows[k + 1][m + 1], rows[k + 1][m]])
    for m in range(M):
        bm.faces.new([rows[K - 1][m], rows[K - 1][m + 1], top])
    bm.normal_update()
    for f in bm.faces:
        if f.normal.y < 0:
            f.normal_flip()
        f.material_index = 0
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for m in mats:
        ob.data.materials.append(m)
    so = ob.modifiers.new("solid", "SOLIDIFY")
    so.thickness = THICK
    so.offset = -1.0
    so.use_rim = True
    so.material_offset = 2
    so.material_offset_rim = 1
    bev = ob.modifiers.new("bevel", "BEVEL")
    bev.width = 0.010
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bend = ob.modifiers.new("bend", "SIMPLE_DEFORM")
    bend.deform_method = "BEND"
    bend.deform_axis = "X"
    bend.angle = 0.0
    rest = Matrix((X, Y, Z)).transposed().to_quaternion()
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = rest
    ob.location = mid
    ob["rest"] = list(rest)
    return ob


def build():
    global CORE, ROOT
    PIECES.clear(); SHARDS.clear()
    clear_scene()
    clear, frost, core = make_materials()
    inner = bpy.data.materials.new("bud_inner")
    b = principled(inner)
    b.inputs["Base Color"].default_value = (1.0, 0.985, 0.99, 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["IOR"].default_value = 1.47
    b.inputs["Transmission Weight"].default_value = 1.0
    ROOT = bpy.data.objects.new("bud_root", None)
    bpy.context.collection.objects.link(ROOT)
    O = Vector((0, 0, 0.0))
    A = Vector((0, 0, TOP))
    B = Vector((0, 0, BOT))
    for i in range(N):
        v0, v1 = eq(i), eq(i + 1)
        # 上瓣：外表面 = (A, v0, v1) → 下标 1,2,3
        up = plate(f"petal_{i}", [A, v0, v1], [clear, frost, inner])
        lo = plate(f"sepal_{i}", [B, v0, v1], [clear, frost, inner])
        for ob, kind in ((up, "petal"), (lo, "sepal")):
            mid = (v0 + v1) / 2
            ob.parent = ROOT
            axis = (v1 - v0).normalized()
            PIECES.append((ob, mid.copy(), axis, kind, i))
    # 晶核雾
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0)
    CORE = bpy.context.active_object
    CORE.name = "core"
    CORE.data.materials.append(core)
    CORE.parent = ROOT
    # 碎屑：四块小晶片，梦面才出现
    import random
    rnd = random.Random(7)
    trip = [(0.07 + 0.05 * rnd.random(), rnd.random() * 2 * math.pi, 0.95 + 0.35 * rnd.random(), -0.4 + 1.5 * rnd.random(), rnd.random()) for _ in range(2)]
    for k in range(6):
        s, ph0, rad0, z0, sp0 = trip[k // 3]
        pts = [Vector((0, 0, s * 1.6)), Vector((s, 0, 0)), Vector((-s * .5, s * .86, 0)), Vector((-s * .5, -s * .86, 0))]
        sh = tetra(f"shard_{k}", pts + [], (1, 2, 3), [clear, frost])
        sh.parent = ROOT
        SHARDS.append((sh, ph0 + (k % 3) * 2 * math.pi / 3, rad0, z0, sp0, (k % 3) * 2 * math.pi / 3))
    setup_world_and_lights()
    setup_camera()
    pose(0.0, 0.0)


# 三长三短：偶数瓣开得更大（外轮），奇数瓣稍收（内轮）
TILT = 0.0
SCALE = 1.18
OPEN_OUT = 38.0
OPEN_IN = 22.0
JIT = [3.0, -2.0] * 3  # 三重对称：梦面 120° 循环
BEND_OUT = 62.0
BEND_IN = 40.0
BEND_SEPAL = 12.0
BEND_SIGN = 1.0


def pose(dream, angle_deg):
    d = smooth(dream)
    ROOT.rotation_mode = "XYZ"
    tilt = math.radians(TILT) * d
    ROOT.matrix_world = Matrix.Rotation(-tilt, 4, "X") @ Matrix.Rotation(math.radians(angle_deg), 4, "Z") @ Matrix.Scale(SCALE * (1 - 0.12 * d), 4)
    ROOT.location = (0, 0, -0.06 * d)
    for ob, mid, axis, kind, i in PIECES:
        # 每块错开开始时间，避免整齐划一
        delay = (i % 2) * 0.12 + (0.08 if kind == "sepal" else 0.0)
        t = smooth((dream - delay) / (1 - 0.2))
        radial = Vector((mid.x, mid.y, 0)).normalized()
        if kind == "petal":
            ang = (OPEN_OUT if i % 2 == 0 else OPEN_IN) + JIT[i]
            lift = Vector((0, 0, 0.22 + 0.10 * (i % 2)))
            push = radial * (0.12 if i % 2 == 0 else 0.04)
            sign = 1
        else:
            ang = 9.0 + JIT[i] * 1.0
            lift = Vector((0, 0, -0.22 - 0.06 * (i % 2)))
            push = radial * 0.10
            sign = -1
        rest = Quaternion(ob["rest"])
        zdir = rest @ Vector((0, 0, 1))
        # 绕铰链边向外翻：选使尖端更朝外的方向
        q = Quaternion(axis, math.radians(ang) * t)
        if (q @ zdir).dot(radial) < zdir.dot(radial):
            q = Quaternion(axis, -math.radians(ang) * t)
        bend = (BEND_OUT if i % 2 == 0 else BEND_IN) if kind == "petal" else BEND_SEPAL
        ob.modifiers["bend"].angle = math.radians(bend + JIT[i] * 2) * t * BEND_SIGN
        # 绕自身径向轻微扭转
        twist = Quaternion(radial, math.radians(JIT[i] * 1.2) * t)
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = twist @ q @ rest
        ob.location = mid + (lift + push) * t
    # 晶核：醒面隐在中间偏淡，梦面上浮发亮
    CORE.location = (0, 0, 0.18 + 0.42 * d)
    s = 0.26 + 0.10 * d
    CORE.scale = (s, s, s * 1.15)
    em = CORE.data.materials[0].node_tree.nodes["core_emit"]
    em.inputs[1].default_value = 4.0 + 10.0 * d
    for sh, ph, rad, z, sp, base in SHARDS:
        t = smooth((dream - 0.25 - 0.3 * sp) / 0.45)
        a = ph
        th3 = math.radians(angle_deg) * 3  # 每 120° 一个周期
        bob = 0.06 * math.sin(th3 + sp * 6.283)
        sh.location = (rad * math.cos(a) * (0.6 + 0.4 * t), rad * math.sin(a) * (0.6 + 0.4 * t), z * t + 0.3 + bob * t)
        sh.scale = (t, t, t)
        from mathutils import Euler
        sh.rotation_euler = (Matrix.Rotation(base, 3, 'Z') @ Euler((sp * 3 + th3, sp * 5 - th3, sp * 2)).to_matrix()).to_euler()
        sh.hide_render = t < 0.01


def setup_world_and_lights():
    sc = bpy.context.scene
    w = bpy.data.worlds.new("bud_world")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mz = nt.nodes.new("ShaderNodeMapRange")
    mz.inputs["From Min"].default_value = -1.0
    mz.inputs["From Max"].default_value = 1.0
    nt.links.new(sep.outputs["Z"], mz.inputs["Value"])
    nt.links.new(mz.outputs["Result"], ramp.inputs["Fac"])
    els = ramp.color_ramp.elements
    # 地平线下偏灰紫，地平线一道亮带，上方淡丁香
    els[0].position = 0.0; els[0].color = (0.70, 0.66, 0.72, 1)
    els[1].position = 1.0; els[1].color = (0.86, 0.87, 0.96, 1)
    e = els.new(0.47); e.color = (0.78, 0.72, 0.78, 1)
    e = els.new(0.505); e.color = (2.4, 2.15, 2.0, 1)
    e = els.new(0.54); e.color = (0.90, 0.85, 0.92, 1)
    # 地平线下一组细暗线（线景），让晶体折射出线
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"; wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 6.0
    wave.inputs["Distortion"].default_value = 1.5
    wave.inputs["Detail"].default_value = 1.0
    nt.links.new(tc.outputs["Generated"], wave.inputs["Vector"])
    lr = nt.nodes.new("ShaderNodeValToRGB")
    lr.color_ramp.elements[0].position = 0.0; lr.color_ramp.elements[0].color = (0.30, 0.25, 0.30, 1)
    lr.color_ramp.elements[1].position = 0.045; lr.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(wave.outputs["Fac"], lr.inputs["Fac"])
    below = nt.nodes.new("ShaderNodeMapRange")
    below.inputs["From Min"].default_value = 0.02
    below.inputs["From Max"].default_value = -0.08
    nt.links.new(sep.outputs["Z"], below.inputs["Value"])
    mixl = nt.nodes.new("ShaderNodeMix"); mixl.data_type = "RGBA"
    nt.links.new(below.outputs["Result"], mixl.inputs[0])
    mixl.inputs[6].default_value = (1, 1, 1, 1)
    nt.links.new(lr.outputs["Color"], mixl.inputs[7])
    mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    nt.links.new(ramp.outputs["Color"], mul.inputs[6])
    nt.links.new(mixl.outputs[2], mul.inputs[7])
    nt.links.new(mul.outputs[2], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    def area(name, loc, rot, size, energy, color, cam_vis=False):
        ld = bpy.data.lights.new(name, "AREA")
        ld.shape = "RECTANGLE"
        ld.size, ld.size_y = size
        ld.energy = energy
        ld.color = color
        ob = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = [math.radians(r) for r in rot]
        ob.visible_camera = cam_vis
        return ob

    # 左上一条长窗光（给棱面一道细亮线）
    area("key", (-3.2, -2.6, 3.6), (48, 0, -50), (0.35, 4.0), 520, (1.0, 0.98, 0.97))
    # 右后暖边光
    area("rim", (3.0, 3.2, 1.2), (75, 0, 140), (1.2, 2.5), 300, (1.0, 0.80, 0.62))
    # 顶部冷光
    area("top", (0.4, 0.0, 4.5), (0, 0, 0), (2.5, 2.5), 120, (0.85, 0.9, 1.0))
    # 底部淡粉反光
    area("bounce", (0, -1.0, -3.0), (160, 0, 0), (3.0, 3.0), 60, (1.0, 0.86, 0.92))


def setup_camera():
    sc = bpy.context.scene
    cd = bpy.data.cameras.new("cam")
    cd.lens = 85
    cam = bpy.data.objects.new("cam", cd)
    bpy.context.collection.objects.link(cam)
    el = math.radians(17)
    dist = 9.4
    cam.location = (0, -dist * math.cos(el), 0.22 + dist * math.sin(el))
    cam.rotation_euler = (math.pi / 2 - el, 0, 0)
    sc.camera = cam
    try:
        sc.render.engine = "CYCLES"
    except TypeError as e:
        print(e)
    sc.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "CUDA"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "CUDA"
    sc.cycles.samples = 160
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 24
    sc.cycles.transmission_bounces = 24
    sc.cycles.glossy_bounces = 12
    sc.cycles.volume_bounces = 2
    sc.cycles.caustics_reflective = True
    sc.cycles.caustics_refractive = True
    sc.cycles.blur_glossy = 0.6
    sc.render.film_transparent = True
    sc.cycles.film_transparent_glass = False
    sc.render.resolution_x = 900
    sc.render.resolution_y = 900
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    pass
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
