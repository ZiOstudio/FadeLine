# -*- coding: utf-8 -*-
"""
晾衣杆 · 数据层

Markdown 文件夹就是数据库。这个模块是唯一的读写入口，
不依赖任何界面代码，可以单独测试。
"""

import os
import re
import datetime
import tempfile

FOLDERS = [
    ("hanging", "01-在杆"),
    ("closet", "02-衣柜"),
    ("expired", "03-过期未处理"),
    ("trash", "04-垃圾桶"),
]
KEY_TO_DIR = dict(FOLDERS)
DIR_TO_KEY = dict((v, k) for k, v in FOLDERS)

DEFAULT_CAPACITY = 18
DOOM_HOURS = 48
EXPIRE_DAYS = 14

CLIPS = ["red", "blue", "amber", "teal", "purple", "gray"]
CLIP_HEX = {
    "red": "#A32D2D", "blue": "#185FA5", "amber": "#854F0B",
    "teal": "#0F6E56", "purple": "#534AB7", "gray": "#5F5E5A",
}

ILLEGAL = re.compile(r'[\\/:*?"<>|\r\n\t]')
FM = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n", re.S)
TAIL = re.compile(r"\n*-{3,}\s*\n<sub>.*?</sub>\s*\Z", re.S)


# ---------------------------------------------------------------- 基础工具

def fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def parse_dt(s):
    if not s:
        return None
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s.strip(), f)
        except ValueError:
            continue
    return None


def slug(text, n=18):
    s = ILLEGAL.sub("", text or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n] or "未命名"


def make_id(dt):
    return "%06x" % (int(dt.timestamp()) & 0xFFFFFF)


def atomic_write(path, content):
    folder = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------- 序列化

def render(idea):
    lines = ["---"]
    lines.append("id: %s" % idea["id"])
    lines.append("created: %s" % idea["created"])
    lines.append("source: %s" % (idea.get("source") or ""))
    lines.append("clip: %s" % (idea.get("clip") or "blue"))
    lines.append("pinned: %s" % ("true" if idea.get("pinned") else "false"))
    if idea.get("doom_at"):
        lines.append("doom_at: %s" % idea["doom_at"])
    lines.append("history:")
    for h in idea.get("history") or []:
        lines.append("  - %s" % h)
    lines.append("---")
    lines.append("")
    lines.append((idea.get("text") or "").strip())
    lines.append("")
    lines.append("---")
    lines.append("<sub>%s · 记录于 %s</sub>" % (idea.get("source") or "", idea["created"]))
    lines.append("")
    return "\n".join(lines)


def parse_file(path):
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    meta, body = {}, raw
    m = FM.match(raw)
    if m:
        body = raw[m.end():]
        lines = m.group(1).split("\n")
        i = 0
        while i < len(lines):
            line = lines[i]
            if ":" in line and not line.lstrip().startswith("-"):
                k, v = line.split(":", 1)
                k, v = k.strip(), v.strip()
                if k == "history":
                    hist, j = [], i + 1
                    while j < len(lines) and lines[j].lstrip().startswith("- "):
                        hist.append(lines[j].lstrip()[2:].strip())
                        j += 1
                    meta["history"] = hist
                    i = j
                    continue
                meta[k] = v
            i += 1
    body = TAIL.sub("", body).strip()
    return meta, body


# ---------------------------------------------------------------- 仓库

def ensure_vault(vault):
    for _, d in FOLDERS:
        os.makedirs(os.path.join(vault, d), exist_ok=True)
    return vault


def _make_idea(text, source, dt=None, clip="blue"):
    dt = dt or datetime.datetime.now()
    return {
        "id": make_id(dt),
        "created": fmt(dt),
        "created_dt": dt,
        "source": source or "",
        "clip": clip,
        "pinned": False,
        "doom_at": None,
        "history": ["%s · 记录于 %s" % (fmt(dt), source or "未知来源")],
        "text": (text or "").strip(),
        "status": "hanging",
        "filename": "%s-%s %s.md" % (dt.strftime("%Y%m%d"), dt.strftime("%H%M"), slug(text)),
        "path": "",
        "age_days": 0,
    }


def _save(idea, vault):
    path = os.path.join(vault, KEY_TO_DIR[idea["status"]], idea["filename"])
    idea["path"] = path
    atomic_write(path, render(idea))
    return idea


def scan(vault, now=None):
    now = now or datetime.datetime.now()
    ideas = []
    for key, dirname in FOLDERS:
        d = os.path.join(vault, dirname)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.lower().endswith(".md") or name.startswith("_"):
                continue
            p = os.path.join(d, name)
            try:
                meta, body = parse_file(p)
            except Exception:
                continue
            created = parse_dt(meta.get("created")) or datetime.datetime.fromtimestamp(os.path.getmtime(p))
            ideas.append({
                "id": meta.get("id") or make_id(created),
                "created": meta.get("created") or fmt(created),
                "created_dt": created,
                "source": meta.get("source", ""),
                "clip": meta.get("clip", "blue") if meta.get("clip") in CLIPS else "blue",
                "pinned": str(meta.get("pinned", "false")).lower() == "true",
                "doom_at": meta.get("doom_at") or None,
                "history": meta.get("history") or [],
                "text": body,
                "status": key,
                "filename": name,
                "path": p,
                "age_days": int((now - created).total_seconds() // 86400),
            })
    ideas.sort(key=lambda x: x["created_dt"], reverse=True)
    return ideas


def add(vault, text, source="", clip="blue", dt=None):
    ensure_vault(vault)
    idea = _make_idea(text, source, dt, clip)
    base, ext = os.path.splitext(idea["filename"])
    path = os.path.join(vault, KEY_TO_DIR["hanging"], idea["filename"])
    n = 2
    while os.path.exists(path):
        idea["filename"] = "%s-%d%s" % (base, n, ext)
        path = os.path.join(vault, KEY_TO_DIR["hanging"], idea["filename"])
        n += 1
    return _save(idea, vault)


def move(vault, idea, status, reason):
    old = idea["path"]
    idea["status"] = status
    if idea.get("doom_at"):
        idea["doom_at"] = None
    if status == "hanging":
        idea["history"].append("%s · 还原回 01-在杆 · %s" % (fmt(datetime.datetime.now()), reason))
    else:
        idea["history"].append("%s · 移入 %s · 原因：%s" % (
            fmt(datetime.datetime.now()), KEY_TO_DIR[status], reason))
    idea["path"] = os.path.join(vault, KEY_TO_DIR[status], idea["filename"])
    if old and os.path.exists(old):
        try:
            os.remove(old)
        except OSError:
            pass
    return _save(idea, vault)


# ---------------------------------------------------------------- 结算

def settle(vault, capacity=DEFAULT_CAPACITY, now=None):
    """
    只在「用户打开面板」时调用。每次最多淘汰 1 条。
    返回 {"marked": [...], "moved": [...], "full": bool}
    """
    now = now or datetime.datetime.now()
    ideas = scan(vault, now)
    hanging = sorted([i for i in ideas if i["status"] == "hanging"], key=lambda x: x["created_dt"])

    marked = []
    if len(hanging) > capacity:
        for i in hanging[:len(hanging) - capacity]:
            if i["pinned"] or i.get("doom_at"):
                continue
            i["doom_at"] = fmt(now)
            i["history"].append("%s · 标记待淘汰 · 满屏后为最旧一条" % fmt(now))
            _save(i, vault)
            marked.append(i)

    pool = []
    for i in hanging:
        if i["pinned"]:
            continue
        if i["age_days"] > EXPIRE_DAYS:
            pool.append((i["created_dt"], 0, i, "超过 %d 天未被触碰" % EXPIRE_DAYS))
        elif i.get("doom_at"):
            d = parse_dt(i["doom_at"])
            if d and (now - d).total_seconds() >= DOOM_HOURS * 3600:
                pool.append((d, 1, i, "满屏后停留 %d 小时未处理" % DOOM_HOURS))

    moved = []
    if pool:
        pool.sort(key=lambda x: x[0])
        target = pool[0][2]
        move(vault, target, "expired", pool[0][3])
        moved.append(target)

    return {"marked": marked, "moved": moved, "full": len(hanging) >= capacity}
