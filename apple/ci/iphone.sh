#!/bin/sh
# Prints the id of an available iPhone simulator, on the newest iOS that the selected Xcode's SDK supports, for
#   xcodebuild -destination "id=$(sh ci/iphone.sh)"
set -eu
SDK=$(xcrun --sdk iphonesimulator --show-sdk-version)
xcrun simctl list devices available --json | python3 -c '
import json, sys
sdk = tuple(int(x) for x in sys.argv[1].split("."))
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    if ".iOS-" not in runtime:
        continue
    version = tuple(int(x) for x in runtime.rsplit(".iOS-", 1)[1].split("-") if x.isdigit())
    if version > sdk:
        continue
    for d in devices:
        if d.get("isAvailable", True) and d["name"].startswith("iPhone"):
            key = (version, d["name"])
            if best is None or key > best[0]:
                best = (key, d["udid"])
if best is None:
    sys.exit("No iPhone simulator is available")
print(best[1])
' "$SDK"
