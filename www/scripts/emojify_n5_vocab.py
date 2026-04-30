#!/usr/bin/env python3
"""Rewrite www/src/N5-Vocab.csv with a word-aligned emoji column."""

from __future__ import annotations

import csv
import re
from io import StringIO
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[2] / "www" / "src" / "N5-Vocab.csv"

# Longest-first substring matches against lowercased English gloss.
RULES: list[tuple[str, str]] = [
    ("grandfather", "👴"),
    ("grandmother", "👵"),
    ("younger brother", "👦"),
    ("younger sister", "👧"),
    ("older brother", "👨"),
    ("older sister", "👩"),
    ("coffee lounge", "☕"),
    ("tape recorder", "📼"),
    ("western style door", "🚪"),
    ("business shirt", "👔"),
    ("fried prawn", "🍤"),
    ("rice bowl", "🍚"),
    ("boxed lunch", "🍱"),
    ("sweet bean jelly", "🍡"),
    ("post office", "📮"),
    ("traffic lights", "🚦"),
    ("traffic signal", "🚥"),
    ("police officer", "👮"),
    ("police box", "🚨"),
    ("train station", "🚉"),
    ("traffic accident", "🚧"),
    ("public telephone", "☎️"),
    ("western food", "🍽️"),
    ("sweet bean soup", "🍵"),
    ("changing room", "🚻"),
    ("sweet bean water", "🥤"),
    ("rice wine", "🍶"),
    ("green tea", "🍵"),
    ("sweet sake", "🍶"),
    ("hand towel", "🧣"),
    ("handkerchief", "🧻"),
    ("glue stick", "🧴"),
    ("sweet cake", "🍰"),
    ("middle aged gentleman", "🧔"),
    ("day before yesterday", "🗓️"),
    ("day after tomorrow", "🗓️"),
    ("year before last", "🗓️"),
    ("year after next", "🗓️"),
    ("every morning", "🌅"),
    ("every night", "🌙"),
    ("every day", "📅"),
    ("every week", "🗓️"),
    ("every month", "📆"),
    ("every year", "🗓️"),
    ("middle school", "🎓"),
    ("sweet potatoes", "🍠"),
    ("cold to the touch", "❄️"),
    ("thin piece of sliced", "📄"),
    ("paint brush", "🖌️"),
    ("cloudy weather", "☁️"),
    ("to take time or money", "⏱️"),
    ("take care of", "🤝"),
    ("postage stamp", "🎟️"),
    ("mailbox", "📫"),
    ("to smoke", "🚬"),
    ("to be sunny", "☀️"),
    ("how much", "💴"),
    ("how many", "🔢"),
    ("which of two", "🔀"),
    ("which (of three or more)", "🔀"),
    ("second day", "2️⃣"),
    ("fourth day", "4️⃣"),
    ("fifth day", "5️⃣"),
    ("sixth day", "6️⃣"),
    ("three days", "3️⃣"),
    ("seven days,the seventh day", "7️⃣"),
    ("twenty days", "📆"),
    ("five days", "5️⃣"),
    ("seven people", "7️⃣"),
    ("20 years old", "🎂"),
    ("20th year", "🎂"),
    ("finger language", "🤟"),
    ("chicken meat", "🍗"),
    ("next door to", "🏘️"),
    ("to be worried", "😟"),
    ("to get off", "🚌"),
    ("to descend", "⬇️"),
    ("to disappear", "🫥"),
    ("to line up", "🧑‍🤝‍🧑"),
    ("to set up", "🧑‍🤝‍🧑"),
    ("to invite", "✉️"),
    ("to hurry", "💨"),
    ("to teach", "👩‍🏫"),
    ("to cut", "✂️"),
    ("to shave", "🪒"),
    ("to dye", "🎨"),
    ("to forget", "🧠"),
]

# Dedupe rules by needle (keep longest first after sort)
RULES_MERGED: dict[str, str] = {}
for needle, em in RULES:
    RULES_MERGED.setdefault(needle, em)
RULES = sorted(RULES_MERGED.items(), key=lambda x: len(x[0]), reverse=True)

VERB_EMOJI: dict[str, str] = {
    "answer": "💬",
    "appear": "👀",
    "arrive": "🛬",
    "ask": "❓",
    "bathe": "🛁",
    "become": "🦋",
    "begin": "▶️",
    "bend": "↩️",
    "bloom": "🌸",
    "blow": "💨",
    "borrow": "🤝",
    "brush": "🪥",
    "buy": "🛒",
    "call": "📞",
    "clean": "🧹",
    "climb": "🧗",
    "close": "🚪",
    "come": "🚶",
    "contain": "📦",
    "copy": "📄",
    "cut": "✂️",
    "descend": "⬇️",
    "die": "⚰️",
    "differ": "≠",
    "disappear": "🫥",
    "do": "✅",
    "drink": "🥤",
    "eat": "🍽️",
    "enter": "🚪",
    "erase": "🧽",
    "fall": "🍂",
    "finish": "🏁",
    "fly": "🕊️",
    "forget": "🧠",
    "get": "🫴",
    "give": "🎁",
    "go": "🚶",
    "hand": "✋",
    "have": "🙌",
    "hear": "👂",
    "hold": "🤲",
    "hop": "🐸",
    "invite": "✉️",
    "know": "🧠",
    "learn": "📚",
    "leave": "🚶",
    "lend": "🤝",
    "line": "📏",
    "listen": "👂",
    "live": "🏠",
    "lose": "😞",
    "make": "🔨",
    "meet": "🤝",
    "need": "🙏",
    "open": "📂",
    "play": "🎮",
    "polish": "✨",
    "practice": "🎯",
    "pull": "↔️",
    "push": "🫸",
    "put": "📥",
    "raise": "✋",
    "read": "📖",
    "remember": "🧠",
    "rest": "😌",
    "return": "↩️",
    "ride": "🚴",
    "run": "🏃",
    "say": "💬",
    "see": "👁️",
    "sell": "💴",
    "set": "⚙️",
    "show": "👉",
    "shower": "🚿",
    "sing": "🎤",
    "sit": "🪑",
    "sleep": "😴",
    "smoke": "🚬",
    "speak": "🗣️",
    "stamp": "🪙",
    "stand": "🧍",
    "stick": "📌",
    "stretch": "🤸",
    "stroll": "🚶",
    "study": "📚",
    "suck": "🥤",
    "sweep": "🧹",
    "swim": "🏊",
    "take": "🤏",
    "teach": "👩‍🏫",
    "tell": "📣",
    "tie": "🎀",
    "turn": "↪️",
    "use": "🛠️",
    "wait": "⌛",
    "walk": "🚶",
    "wash": "🧼",
    "watch": "📺",
    "wear": "👔",
    "work": "💼",
    "write": "✍️",
}

TOKEN_EMOJI: dict[str, str] = {
    "month": "📆",
    "year": "🗓️",
    "week": "🗓️",
    "day": "📅",
    "night": "🌙",
    "morning": "🌅",
    "afternoon": "🌤️",
    "evening": "🌆",
    "today": "📌",
    "tomorrow": "⏭️",
    "yesterday": "⏮️",
    "minute": "⏱️",
    "hour": "🕐",
    "time": "⏰",
    "money": "💴",
    "rain": "🌧️",
    "snow": "❄️",
    "wind": "💨",
    "thunder": "⛈️",
    "sunny": "☀️",
    "cloud": "☁️",
    "truth": "🤫",
    "story": "📖",
    "talk": "💬",
    "photograph": "📸",
    "fat": "🫃",
    "big": "🐘",
    "little": "🤏",
    "narrow": "↕️",
    "strong": "💪",
    "difficult": "😰",
    "easy": "😌",
    "delicious": "😋",
    "spicy": "🌶️",
    "white": "⬜",
    "blue": "🔵",
    "yellow": "🟡",
    "red": "🔴",
    "black": "⬛",
    "brown": "🟤",
    "shop": "🏪",
    "station": "🚉",
    "school": "🏫",
    "library": "📚",
    "map": "🗺️",
    "gate": "⛩️",
    "bridge": "🌉",
    "chopsticks": "🥢",
    "pond": "🦆",
    "garden": "🌷",
    "uncle": "🧔",
    "father": "👨",
    "mother": "👩",
    "aunt": "👩‍🦱",
    "child": "🧒",
    "wife": "👰",
    "husband": "🤵",
    "daughter": "👧",
    "son": "👦",
    "friend": "🤝",
    "eyes": "👀",
    "eye": "👁️",
    "nose": "👃",
    "flower": "🌺",
    "meat": "🥩",
    "beef": "🥩",
    "candy": "🍬",
    "milk": "🥛",
    "curry": "🍛",
    "tea": "🍵",
    "coffee": "☕",
    "bread": "🍞",
    "egg": "🥚",
    "apple": "🍎",
    "rice": "🍚",
    "meal": "🍽️",
    "drink": "🥤",
    "door": "🚪",
    "window": "🪟",
    "knife": "🔪",
    "spoon": "🥄",
    "fork": "🍴",
    "cup": "☕",
    "box": "📦",
    "key": "🔑",
    "envelope": "✉️",
    "bath": "🛁",
    "bed": "🛏️",
    "chair": "🪑",
    "table": "🍽️",
    "television": "📺",
    "camera": "📷",
    "radio": "📻",
    "elevator": "🛗",
    "socks": "🧦",
    "shoes": "👟",
    "necktie": "👔",
    "slippers": "🩴",
    "towel": "🧖",
    "newspaper": "📰",
    "notebook": "📓",
    "dictionary": "📕",
    "pen": "🖊️",
    "eraser": "🧽",
    "glue": "🧴",
    "letter": "✉️",
    "mirror": "🪞",
    "clock": "🕒",
    "watch": "⌚",
    "button": "🔘",
    "pocket": "🧥",
    "cigarettes": "🚬",
    "weather": "🌦️",
    "stomach": "🍽️",
    "traffic": "🚦",
    "airplane": "✈️",
    "plane": "✈️",
    "motorcycle": "🏍️",
    "bike": "🚲",
    "bus": "🚌",
    "car": "🚗",
    "taxi": "🚕",
    "train": "🚃",
    "boat": "⛵",
    "ocean": "🌊",
    "river": "🏞️",
    "south": "⬇️",
    "north": "⬆️",
    "east": "➡️",
    "west": "⬅️",
    "outside": "🌳",
    "inside": "🏠",
    "corner": "📐",
    "intersection": "🚸",
    "embassy": "🏛️",
    "museum": "🏛️",
    "bank": "🏦",
    "hotel": "🏨",
    "hospital": "🏥",
    "company": "🏢",
    "building": "🏢",
    "church": "⛪",
    "tower": "🗼",
    "spring": "🌸",
    "summer": "🏖️",
    "autumn": "🍂",
    "winter": "⛄",
    "sky": "🌌",
    "moon": "🌙",
    "star": "⭐",
    "tree": "🌲",
    "medicine": "💊",
    "illness": "🤒",
    "toothbrush": "🪥",
    "toilet": "🚽",
    "bathroom": "🚽",
    "shower": "🚿",
    "refrigerator": "🧊",
    "fridge": "🧊",
    "sweet": "🍬",
    "salt": "🧂",
    "sugar": "🍬",
    "soy": "🧂",
    "party": "🎉",
    "movie": "🎬",
    "music": "🎵",
    "travel": "🧳",
    "animal": "🐾",
    "dog": "🐕",
    "cat": "🐈",
    "bird": "🐦",
    "fish": "🐟",
    "pig": "🐷",
    "cow": "🐮",
    "horse": "🐎",
    "sheep": "🐑",
    "monkey": "🐵",
    "name": "🪪",
    "birthday": "🎂",
    "foreigner": "🌐",
    "foreign": "🌐",
    "student": "🎓",
    "teacher": "👩‍🏫",
    "policeman": "👮",
    "driver": "🚗",
    "question": "❓",
    "answer": "💬",
}

CAT_FALLBACK = {
    "greetings": "💬",
    "numbers": "🔢",
    "colors": "🎨",
    "animals": "🐾",
    "food": "🍙",
    "body": "🧍",
    "days": "📅",
    "family": "👨‍👩‍👧",
    "classroom": "📚",
    "weather": "🌦️",
    "seasons": "🍂",
    "transport": "🚉",
    "clothes": "👕",
    "sports": "⚽",
    "hobbies": "🎭",
    "house": "🏠",
    "emotions": "😊",
    "months": "📆",
    "jobs": "👷",
    "instruments": "🎼",
    "insects": "🐞",
    "japanesefood": "🍣",
    "places": "🗾",
    "adjectives": "✨",
    "verbs": "🏃",
}


def jp_root(jp: str) -> str:
    return re.sub(r"\s+", "", jp.split("/")[0].strip())


def pick_emoji(jp: str, english: str, cat: str) -> str:
    e = english.lower().replace('"', "")
    jp0 = jp_root(jp)

    if jp0 == "はな":
        if cat == "body" or "nose" in e:
            return "👃"
        return "🌸"
    if jp0 == "あめ":
        if "rain" in e:
            return "🌧️"
        return "🍬"

    # Chopsticks vs bridge はし — both use はし spelling
    if jp0 == "はし":
        if "chopstick" in e:
            return "🥢"
        if "bridge" in e:
            return "🌉"

    for needle, em in RULES:
        if needle in e:
            return em

    clauses = [c.strip() for c in re.split(r"[,;/]", e) if c.strip()]
    if not clauses:
        clauses = [e]

    for clause in clauses:
        clow = clause.lower().strip()

        # "to be <adj>" weather / state
        if clow.startswith("to be ") and len(clow) > 6:
            tail = clow[6:]
            if "sunny" in tail or "clear" in tail:
                return "☀️"
            if "worried" in tail or "worry" in tail:
                return "😟"
            if "likeable" in tail or "like" in tail:
                return "🥰"
            # fall through — still try verb-ish second word

        if clow.startswith("to ") and len(clow) > 3:
            rest = clow[3:]
            vb = rest.split()[0].strip().strip(",").strip(".")
            if vb == "be" and len(rest.split()) > 1:
                vb2 = rest.split()[1].strip(".,;:")
                if vb2 == "same":
                    return "🟰"
            if vb in VERB_EMOJI:
                return VERB_EMOJI[vb]

        toks = re.findall(r"[a-z]+", clow)
        for t in toks:
            if t in TOKEN_EMOJI:
                return TOKEN_EMOJI[t]

    return CAT_FALLBACK.get(cat.strip(), "🔤")


def main() -> None:
    rows = []
    raw = CSV_PATH.read_text(encoding="utf-8")
    dict_rows = list(csv.DictReader(StringIO(raw)))

    normalized_fieldnames = ["japanese", "english", "Categories", "emoji"]

    for r in dict_rows:
        jp = en = cat = ""
        for k, v in r.items():
            k0 = (k or "").strip().lower()
            if k0 == "japanese":
                jp = v or ""
            elif k0 == "english":
                en = v or ""
            elif k0 == "categories":
                cat = v or ""

        emoji_new = pick_emoji(jp, en, cat)
        rows.append(
            {
                "japanese": jp,
                "english": en,
                "Categories": cat,
                "emoji": emoji_new,
            }
        )

    out_io = StringIO()
    writer = csv.DictWriter(out_io, fieldnames=normalized_fieldnames, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)

    CSV_PATH.write_text(out_io.getvalue(), encoding="utf-8")
    print(f"Wrote {len(rows)} rows to {CSV_PATH}")


if __name__ == "__main__":
    main()
