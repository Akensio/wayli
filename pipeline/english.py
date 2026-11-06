#!/usr/bin/env python3
"""English names for the address book's Hebrew-only entries (places.py), so the app in English shows Latin letters
everywhere: a transliteration, with the words every rider knows in English translated.

A name the book already has in English under the same Hebrew name takes that English as it is (whole_names: a park
mapped in pieces, a chain's branches, a street of the same name in another city). Only a name never seen in English
is made up, in three layers, word by word:
  1. A lexicon learned from the names that have both languages already (OpenStreetMap's streets and places, Overture's
     two-language names, the feed's stop and city translations: about 120k pairs). Two names of the same word count are
     aligned word by word (by sound where English reordered them: "קניון גבעתיים" / "Givatayim Mall"), and an aligned
     pair counts only when the English word sounds like the Hebrew one (the same consonants, by the rule
     transliteration below). So the lexicon holds spellings, never translations: English reorders translated names,
     and position would pair "המלח" with "Sea"; untranslated, "ים המלח" is "Yam HaMelach", which is what the maintainer
     asked for. A Hebrew word's spelling is the one most names agree on. The article and "and" (ה, ו) come off when the
     bare word is known: "ההגנה" is "HaHagana" if seen so, else "Ha" + the spelling of "הגנה".
  2. Generic words translated by hand (GENERIC), in English word order: "בית ספר ברנקו וייס" is "Branco Weiss School",
     "מלון דן" is "Dan Hotel", "קפה גרג" stays "Cafe Greg". Short, so the lexicon is not second-guessed.
  3. The rest transliterated by rule (translit): consonants as Israeli signs write them (ח ch, צ tz, ש sh, כ kh), the
     vowel letters as vowels, a light vowel between consonant clusters. Without vowel points this is a guess, readable
     rather than right ("פיטר" -> "Piter").
A name with Latin letters inside it ("מלון כנען ספא - canaan spa hotel") keeps that part as its English. Names in
Arabic script are left alone: the rules are Hebrew's.
"""
import re
from collections import Counter, defaultdict

HEB = re.compile(r"[א-ת]")
LAT = re.compile(r"[A-Za-z]")
SPLIT = re.compile(r"[\s.,;:!?()\[\]/\-–—]+")   # what parts words; quotes are stripped off the ends of a word (below)
QUOTES = "\"'״׳`"
COMPANY = {"בע\"מ", "בע״מ", "בעמ", "בע'מ", "ltd", "ltd."}   # the company suffix says nothing about the place


def tokens(s):
    return [t for t in (w.strip(QUOTES) for w in SPLIT.split(s)) if t and t.lower() not in COMPANY and t not in DROP]

# ---- rule transliteration
CONS = {"ב": "v", "ג": "g", "ד": "d", "ז": "z", "ח": "ch", "ט": "t", "כ": "kh", "ך": "kh", "ל": "l", "מ": "m", "ם": "m",
        "נ": "n", "ן": "n", "ס": "s", "פ": "f", "ף": "f", "צ": "tz", "ץ": "tz", "ק": "k", "ר": "r", "ש": "sh", "ת": "t"}
VOWELS = set("אהוי")
VAV_YOD = set("וי")
PREFIX_LETTERS = {"ל": "e", "כ": "e", "ש": "e", "מ": "i"}   # a prefix letter before a consonant takes a vowel (not ב: too many roots)
CONSONANT = re.compile(r"[bcdfgjklmnpqrstvxz]")
DROP = {"ע\"ש", "ע״ש", "עש"}   # "named after": English names leave it out
ONE_LETTER = {"א": "A", "ע": "A", "ה": "H", "ו": "V", "י": "Y"}


def translit(w):
    """A Hebrew word in Latin letters by rule, capitalised."""
    if len(w) == 1:
        return ONE_LETTER.get(w, CONS.get(w, w).upper())
    if len(w) > 3 and w[0] == "ה" and w[1] not in VOWELS:
        return "Ha" + translit(w[1:])   # the article, written as the sources write it: HaFranki
    out = []
    n = len(w)
    if n > 3 and w[0] in PREFIX_LETTERS and w[1] not in VOWELS and w[1] not in QUOTES:
        w = w[0] + "\0" + w[1:]   # a vowel after the prefix letter, placed below
    n = len(w)
    for i, c in enumerate(w):
        prev = w[i - 1] if i else ""
        nxt = w[i + 1] if i + 1 < n else ""
        last = i == n - 1
        if c == "\0":
            out.append(PREFIX_LETTERS[prev])
        elif c == "א":
            if i == 0 and nxt == "י":
                out.append("i")   # איתן, אירועים: the yod is this vowel
            elif not last and prev in VAV_YOD and nxt == "ה" and i + 2 == n:
                out.append("a")   # רפואה
            else:
                out.append("a" if not last and nxt not in VAV_YOD and prev not in VAV_YOD else ("a" if last and prev not in VOWELS else ""))
        elif c == "ע":
            out.append("a" if not last and nxt not in VAV_YOD and prev not in VAV_YOD else "")
        elif c == "ה":
            if i == 0 and not last:
                out.append("ha")   # the article, or a word that starts so (הכל, הרצל, הישן)
            else:
                out.append("a" if last and prev not in VOWELS else ("h" if not last else ""))
        elif c == "ו":
            if i == 0:
                out.append("v")
            elif prev == "ו":
                pass   # וו: one v, written for the first
            elif nxt == "ו":
                out.append("v")
            else:
                out.append("o")
        elif c == "י":
            if i == 0:
                out.append("y")
            elif prev == "א" and i == 1:
                pass   # the alef wrote it
            elif prev == "ה" and i == 1:
                out.append("y")   # הישן: Hayashan
            elif prev == "ו" and i == 1 and nxt != "י":
                out.append("i")   # ויצמן, ויקטור: Vitzman, Viktor
            elif nxt == "י":
                out.append("a" if prev not in VOWELS else "")   # יי: a-yi between consonants (חיים, שיניים)
            elif prev == "י":
                out.append("ai" if i == 2 and w[0] == "ו" else ("yi" if nxt and nxt not in VOWELS else "y"))   # וייס: Vais
            elif prev in "אעו":
                out.append("y")
            else:
                out.append("i")
        elif c == "ב":
            out.append("b" if i == 0 or prev == "\0" else "v")
        elif c == "כ":
            out.append("k" if i == 0 or prev == "\0" else "kh")
        elif c == "פ":
            out.append("p" if i == 0 or prev == "\0" else "f")
        elif c in QUOTES:
            if out and out[-1] == "g":
                out[-1] = "j"
            elif out and out[-1] == "tz":
                out[-1] = "ch"
            elif out and out[-1] == "z":
                out[-1] = "zh"
            # any other quote (ב"ש, הל"ה) is an abbreviation mark: nothing to say
        elif c in CONS:
            out.append(CONS[c])
        else:
            out.append(c)
    s = "".join(out)
    # a light vowel: a cluster of three consonant sounds gets an "a" after the first at the start of a word, before the
    # last elsewhere; a word ending in two consonants gets an "e" between them (Piter, Rekhev)
    units = re.findall(r"ch|kh|sh|tz|zh|[a-z]", s)
    cons = [bool(CONSONANT.match(u)) for u in units]
    segolate = len(units) == 3 and all(cons)   # רכב, ספר, מלך: Rekhev, Sefer, Melekh
    i = 0
    while i + 2 < len(units):
        if cons[i] and cons[i + 1] and cons[i + 2]:
            at = i + 1 if i == 0 else i + 2
            units.insert(at, "e" if segolate else "a")
            cons.insert(at, False)
        i += 1
    if len(units) == 2 and cons[0] and cons[1]:
        units.insert(1, "a")   # חם, דן, גל
    elif len(units) == 3 and cons[0] and cons[1] and not cons[2]:
        units.insert(1, "a")   # חנה, רמה: Chana, Rama
    elif len(units) >= 3 and cons[-1] and cons[-2] and units[-2] != units[-1]:
        units.insert(len(units) - 1, "e")
    return "".join(units).capitalize()


def sounds_like(he, en):
    """Whether an English word could be the Hebrew word's transliteration: the same consonant sounds, or all but one in
    the same order with the same last one (Hertzl/Herzl, Rakhamim/Rachamim; not Center/Star, not City/HaIr)."""
    t = translit(he)
    a = skeleton(t)
    b = skeleton(en)
    if not a or not b:
        return False
    if len(a) < 2 or len(b) < 2:
        return a == b and onset(t) == onset(en)   # one consonant is no evidence by itself: "החיות" is not "The", אליהו is Eliyahu
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if len(long_) - len(short) > 1 or short[-1] != long_[-1]:
        return False
    j = 0
    for c in short:
        k = long_.find(c, j)
        if k < 0:
            return False
        j = k + 1
    return True


def onset(s):
    """How a spelling starts, a vowel or which consonant, the article and h-sounds aside ("Eliyahu" and "Aliho" both start
    on a vowel; "The" does not)."""
    s = re.sub(r"^(Ha|Al|El)(?=-?[A-Z])", "", s).lower()
    s = re.sub(r"^(ch|kh|h)", "", s)
    return "a" if s[:1] in "aeiouy" else s[:1]


def skeleton(s):
    """The consonant sounds of a Latin spelling, letters that sound alike merged, h/ch/kh gone (ח is written either way)."""
    s = re.sub(r"^(Ha|Al|El)(?=-?[A-Z])", "", s)   # an article written into the word: HaGiborim, Al-Quds (not Eliyahu)
    s = s.lower()
    s = re.sub(r"c(?=[eiy])", "s", s)
    s = s.replace("ph", "f").replace("ch", "").replace("kh", "").replace("sh", "s").replace("tz", "z").replace("ts", "z")
    s = s.replace("th", "t").replace("ck", "k").replace("q", "k").replace("c", "k").replace("w", "v").replace("x", "ks")
    s = s.replace("v", "b")   # ב is written either way (HaGiborim, Avraham)
    s = re.sub(r"[^a-z]", "", s)
    s = re.sub(r"[aeiouyh]", "", s)
    s = re.sub(r"(.)\1+", r"\1", s)
    return s


# ---- the lexicon
PREFIXES = {"ה": "Ha", "ו": "ve"}


def he_words(s):
    return [w for w in tokens(s) if HEB.search(w)]


def en_words(s):
    return [w for w in tokens(s) if LAT.search(w)]


def whole_names(pairs):
    """{Hebrew name, normalised: its English} from the names that have both, the English most of them agree on."""
    votes = defaultdict(Counter)
    for he, en in pairs:
        if he_words(he) and en_words(en):
            votes[" ".join(tokens(he)).lower()][en.strip()] += 1
    return {h: c.most_common(1)[0][0] for h, c in votes.items()}


def learn(pairs):
    """{Hebrew word: its spelling in English} from names that have both: each Hebrew word paired with the English word
    in the same place, or, when English reordered the name, with the one that sounds like it; only pairs that sound
    alike count, and the spelling most names agree on wins."""
    votes = defaultdict(Counter)
    for he, en in pairs:
        h, e = he_words(he), en_words(en)
        if not h or len(h) != len(e):
            continue
        # the words that sound exactly alike pair first (בית with Beit), each English word to one Hebrew word, so a looser
        # likeness never takes a word another owns ("תחנת רכבת בית יהושע" / "Beit Yehoshua Railway Station": רכבת is not Beit)
        taken, pick = set(), {}
        for exact in (True, False):
            for i, a in enumerate(h):
                if i in pick:
                    continue
                for j in [i] + [j for j in range(len(e)) if j != i]:   # its own place first
                    if j in taken or not sounds_like(a, e[j]) or (exact and skeleton(translit(a)) != skeleton(e[j])):
                        continue
                    pick[i] = j
                    taken.add(j)
                    break
        for i, j in pick.items():
            votes[h[i]][e[j]] += 1
    lex = {}
    for h, c in votes.items():
        b, n = c.most_common(1)[0]
        # one name's say is enough only when the sounds match exactly; a looser likeness needs a second name
        if n >= 2 or skeleton(translit(h)) == skeleton(b):
            lex[h] = b
    return lex


# ---- generic words, in English word order
# "X" is the rest of the name. SUFFIX: a leading generic that English puts last ("מלון דן" -> "Dan Hotel"); PREFIX: one
# that stays first ("קפה גרג"); INLINE: translated wherever it stands.
SUFFIX = {
    "בית ספר": "School", "בי\"ס": "School", "ביס": "School", "בית הספר": "School", "תיכון": "High School",
    "בית כנסת": "Synagogue", "בית הכנסת": "Synagogue", "בית חולים": "Hospital", "בית החולים": "Hospital",
    "בית מרקחת": "Pharmacy", "גן ילדים": "Kindergarten", "קופת חולים": "Clinic", "מרפאת": "Clinic",
    "מרפאת שיניים": "Dental Clinic", "מסעדת": "Restaurant", "מסעדה": "Restaurant", "מאפיית": "Bakery",
    "מלון": "Hotel", "קניון": "Mall", "פארק": "Park", "מוזיאון": "Museum", "אוניברסיטת": "University",
    "מכללת": "College", "עיריית": "Municipality", "מרכז": "Center", "חניון": "Parking", "תחנת דלק": "Gas Station",
    "תחנת": "Station", "בית מלון": "Hotel", "בית אבות": "Nursing Home", "מתנ\"ס": "Community Center",
    "מתנס": "Community Center", "ספריית": "Library", "אצטדיון": "Stadium", "נמל": "Port", "שוק": "Market",
    "מגדל": "Tower", "מגדלי": "Towers", "חוף": "Beach", "יער": "Forest", "גשר": "Bridge", "צומת": "Junction",
    "מחלף": "Interchange", "כיכר": "Square", "קיבוץ": "Kibbutz", "מושב": "Moshav", "שכונת": "Neighborhood",
    "מסגד": "Mosque", "כנסיית": "Church", "מסוף": "Terminal", "חטיבת ביניים": "Middle School", "חטיבת": "Brigade",
    "גימנסיה": "Gymnasium", "ישיבה": "Yeshiva", "מכון": "Institute", "מעון": "Daycare", "מרפאה": "Clinic",
}
PREFIX = {
    # words every rider knows in English, kept in place
    "קפה": "Cafe", "בית קפה": "Cafe", "חומוס": "Hummus", "חומוסיית": "Hummus", "פיצה": "Pizza", "פלאפל": "Falafel",
    "שווארמה": "Shawarma", "שוארמה": "Shawarma", "בר": "Bar", "פאב": "Pub", "סופר": "Super", "סטודיו": "Studio",
    "גלריה": "Gallery", "ד\"ר": "Dr.", "דר": "Dr.", "הוסטל": "Hostel", "וילה": "Villa", "קאנטרי": "Country",
    "מיני מרקט": "Minimarket", "מכולת": "Grocery", "סניף": "Branch", "ישיבת": "Yeshivat", "גן": "Gan",
    "שדרות": "Sderot", "שד": "Sderot", "דרך": "Derech", "סמטת": "Simtat", "מעלה": "Maale", "רחוב": "",
    # common words the lexicon cannot learn because OpenStreetMap translates them, in their usual Latin spelling
    "מרכז": "Merkaz", "המרכז": "HaMerkaz", "בית": "Beit", "שוק": "Shuk", "חוף": "Hof", "גשר": "Gesher", "נמל": "Namal",
    "צומת": "Tzomet", "תחנת": "Tahanat", "תחנה": "Tahana", "רכבת": "Rakevet", "הרכבת": "HaRakevet", "קו": "Kav", "כפר": "Kfar", "קרית": "Kiryat", "קריית": "Kiryat",
    "רמת": "Ramat", "נווה": "Neve", "גבעת": "Givat", "עין": "Ein", "באר": "Be'er", "בני": "Bnei", "בת": "Bat",
    "הר": "Har", "נחל": "Nahal", "עמק": "Emek", "ים": "Yam", "העיר": "HaIr", "חנות": "Hanut", "משרד": "Misrad",
    "מספרת": "Misperet", "מכון": "Machon", "אולם": "Ulam", "ספורט": "Sport", "ילדים": "Yeladim", "שיניים": "Shinayim",
    "רפואה": "Refua", "רופא": "Rofe", "ישן": "Yashan", "הישן": "HaYashan", "חדש": "Hadash", "החדש": "HaHadash",
    "מלון": "Malon", "מוסך": "Musach", "מסעדת": "Misedet", "מרפאת": "Mirpaat", "קהילתי": "Kehilati", "אירועים": "Eruim",
    "עיצוב": "Itzuv", "רהיטי": "Rahitei", "רהיטים": "Rahitim", "חומרי": "Chomrei", "בניין": "Binyan", "פירות": "Perot",
    "ירקות": "Yerakot", "וירקות": "veYerakot", "תכשיטים": "Tachshitim", "תכשיטי": "Tachshitei", "ציוד": "Tziyud",
    "מפגש": "Mifgash", "מומחה": "Mumche", "מומחים": "Mumchim", "כושר": "Kosher", "ממלכתי": "Mamlachti", "מרקחת": "Mirkachat",
    # loanwords written in Hebrew letters, back to their own spelling
    "אקספרס": "Express", "סיטי": "City", "סנטר": "Center", "מרקט": "Market", "פארם": "Pharm", "אופטיקה": "Optika",
    "פון": "Phone", "מוטור": "Motor", "סטור": "Store", "האוס": "House", "בוטיק": "Boutique", "גריל": "Grill",
    "בורגר": "Burger", "סושי": "Sushi", "קפיטריה": "Cafeteria", "ספא": "Spa", "פיצריה": "Pizzeria", "ביסטרו": "Bistro",
}
GENERIC_MAX_WORDS = 2


def english_name(name, lex, whole=None):
    """The English for a Hebrew name: the book's own for that name (whole_names) if it has one, else its Latin part if
    it has one, else the words as the layers above give them."""
    words = tokens(name)
    if whole:
        known = whole.get(" ".join(words).lower())
        if known:
            return known
    latin = en_words(name)
    if latin:
        return " ".join(w for w in words if not HEB.search(w))
    if not words or not any(HEB.search(w) for w in words):
        return ""
    tail = ""
    for k in (GENERIC_MAX_WORDS, 1):
        head = " ".join(words[:k])
        if head in SUFFIX and len(words) > k:
            tail, words = SUFFIX[head], words[k:]
            break
        if head in PREFIX:
            words = ([PREFIX[head]] if PREFIX[head] else []) + words[k:]
            break
    out = [word_en(w, lex) if HEB.search(w) else w for w in words]
    out = [w for w in out if w]
    if tail:
        out.append(tail)
    return " ".join(out)


def word_en(w, lex):
    """One Hebrew word's English: its learned spelling, a generic word that reads the same anywhere (Cafe, Hummus), the
    article or "and" before a known word, else the rule transliteration. Leading generics in English order are
    english_name's business; mid-name they are transliterated (מרכז is Merkaz there)."""
    if w in lex:
        return lex[w]
    if w in PREFIX and PREFIX[w]:
        return PREFIX[w]
    if len(w) > 3 and w[0] in PREFIXES:
        rest = w[1:]
        base = lex.get(rest) or PREFIX.get(rest)
        if base:
            return PREFIXES[w[0]] + base
    return translit(w)
