# -*- coding: utf-8 -*-
"""数据层无界面自测：建仓 → 写入 → 扫描 → 满屏标记 → 淘汰 → 归档/删除/还原"""

import os
import sys
import json
import shutil
import datetime

sys.path.insert(0, r"D:\RailBox")
import store

VAULT = r"D:\RailBox\_test_vault"
NOW = datetime.datetime(2026, 10, 10, 15, 32, 11)
report = {"steps": []}


def step(name, data):
    report["steps"].append({"step": name, "data": data})


if os.path.isdir(VAULT):
    shutil.rmtree(VAULT)
store.ensure_vault(VAULT)

step("建仓", sorted(os.listdir(VAULT)))

# 写 3 条
for i, (t, s) in enumerate([
    ("AI 换脸的伦理边界：平台该不该强制打标", "Chrome · 关于 AI 换脸的讨论"),
    ("为什么慢内容在短视频时代反而更留人", "ChatGPT"),
    ("选题枯竭的三个假象，其实是信息摄入不足", "手机 · Obsidian"),
]):
    idea = store.add(VAULT, t, s, store.CLIPS[i], dt=NOW - datetime.timedelta(hours=i))
    step("写入 #%d" % (i + 1), {"file": idea["filename"], "dir": store.KEY_TO_DIR[idea["status"]]})

step("目录内容", {d: sorted(os.listdir(os.path.join(VAULT, d))) for _, d in store.FOLDERS})

ideas = store.scan(VAULT, NOW)
step("扫描结果", [{"text": i["text"][:14], "source": i["source"], "status": i["status"],
                   "clips": i["clip"], "age": i["age_days"]} for i in ideas])

# 单条文件原文
with open(ideas[0]["path"], "r", encoding="utf-8") as f:
    step("单条文件原文", f.read())

# 容量压到 1，触发满屏标记
r = store.settle(VAULT, capacity=1, now=NOW)
step("满屏结算(cap=1)", {"marked": [i["filename"] for i in r["marked"]],
                        "moved": [i["filename"] for i in r["moved"]], "full": r["full"]})

# 时间推进 49 小时后再结算 —— 应淘汰 1 条
r2 = store.settle(VAULT, capacity=1, now=NOW + datetime.timedelta(hours=49))
step("49 小时后结算", {"marked": [i["filename"] for i in r2["marked"]],
                      "moved": [i["filename"] for i in r2["moved"]]})

# 时间推进 30 天再结算 —— 超期淘汰，仍只 1 条
r3 = store.settle(VAULT, capacity=1, now=NOW + datetime.timedelta(days=30))
step("30 天后结算", {"moved": [i["filename"] for i in r3["moved"]]})

after = store.scan(VAULT, NOW + datetime.timedelta(days=30))
step("结算后分布", {d: [i["filename"] for i in after if i["status"] == k]
                 for k, d in store.FOLDERS})

# 手动归档 / 删除 / 还原
alive = [i for i in after if i["status"] == "expired"]
if alive:
    store.move(VAULT, alive[0], "closet", "我主动归档")
    step("归档 1 条后", {d: len([i for i in store.scan(VAULT) if i["status"] == k])
                      for k, d in store.FOLDERS})
if len(alive) > 1:
    store.move(VAULT, alive[1], "restore_placeholder", "x") if False else None

# 还原测试
closeted = [i for i in store.scan(VAULT) if i["status"] == "closet"]
if closeted:
    store.move(VAULT, closeted[0], "hanging", "我从 02-衣柜 还原")
    step("还原后分布", {d: len([i for i in store.scan(VAULT) if i["status"] == k])
                     for k, d in store.FOLDERS})

out = os.path.join(os.environ.get("TEMP", "."), "storetest.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print(out)
