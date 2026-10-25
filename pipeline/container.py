"""The container the app's data files come in (the timetable, the street graph, the address book, the rail graph, the
courses), read on the phone by src/engine/container.js:

    uint32 little-endian   the header's length
    header                 JSON, padded with spaces to a multiple of 4; its "sections" list each array by
                           name, dtype, offset (in the body, a multiple of 4) and length
    body                   the arrays, little-endian

and the whole gzip-compressed. Each script puts what else it needs in the header (counts, names, versions).
"""
import gzip
import json
import struct

import numpy as np

DTYPES = {"int32": "<i4", "uint16": "<u2", "uint8": "u1", "float32": "<f4"}


class Sections:
    """The arrays of a container, added one by one; `list` goes into the header as its "sections"."""

    def __init__(self):
        self.list = []
        self.body = bytearray()

    def add(self, name, arr, dtype):
        a = np.ascontiguousarray(np.asarray(arr, dtype=dtype))
        while len(self.body) % 4:
            self.body.append(0)
        self.list.append({"name": name, "dtype": dtype, "offset": len(self.body), "length": int(a.size)})
        self.body.extend(a.astype(DTYPES[dtype]).tobytes())


def write(path, header, sections, level=9, ascii_only=True):
    """Writes the container; its raw size and its header's, for the log. `ascii_only` False keeps Hebrew readable in
    the header (and smaller); the header must already hold `sections.list`."""
    hjson = json.dumps(header, ensure_ascii=ascii_only, separators=(",", ":")).encode("utf-8")
    hjson += b" " * (-(4 + len(hjson)) % 4)
    raw = struct.pack("<I", len(hjson)) + hjson + bytes(sections.body)
    with gzip.open(path, "wb", compresslevel=level) as f:
        f.write(raw)
    return len(raw), len(hjson)


def read(path):
    """The header and every section as a numpy array over the file's bytes."""
    with gzip.open(path, "rb") as f:
        raw = f.read()
    hlen = struct.unpack_from("<I", raw, 0)[0]
    header = json.loads(raw[4:4 + hlen].decode("utf-8"))
    base = 4 + hlen
    arrays = {s["name"]: np.frombuffer(raw, dtype=DTYPES[s["dtype"]], count=s["length"], offset=base + s["offset"])
              for s in header["sections"]}
    return header, arrays


def read_header(path):
    """The header alone (its format, counts, build time), without reading the arrays."""
    with gzip.open(path, "rb") as f:
        hlen = struct.unpack("<I", f.read(4))[0]
        return json.loads(f.read(hlen).decode("utf-8"))
