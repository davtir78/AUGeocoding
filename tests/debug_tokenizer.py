import re

_RE_FLAT = re.compile(
    r'^(?:unit|u|apt|flat|suite|ste|lot)\s*(\d+\w?)',
    re.IGNORECASE,
)
_RE_LEVEL = re.compile(
    r'^(?:level|lvl|l)\s*(\d+\w?)',
    re.IGNORECASE,
)
_STREET_TYPES = {
    'st', 'street', 'rd', 'road', 'ave', 'avenue', 'ct', 'court', 'pl', 'place',
    'dr', 'drive', 'tce', 'terrace', 'pde', 'parade', 'hwy', 'highway',
    'bvd', 'boulevard', 'ln', 'lane', 'cl', 'close', 'way', 'wk', 'walk',
}
_STATES = {'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'}

def tokenize_address(raw: str) -> dict:
    tokens = {
        'flat': None, 'level': None, 'number': None,
        'street': None, 'type': None, 'locality': None,
        'state': None, 'postcode': None,
    }
    text = raw.strip()
    slash_match = re.match(r'^(\d+\w?)\s*/\s*(.+)', text)
    if slash_match:
        tokens['flat'] = slash_match.group(1)
        text = slash_match.group(2)

    flat_match = _RE_FLAT.match(text)
    if flat_match:
        tokens['flat'] = flat_match.group(1)
        text = text[flat_match.end():].lstrip(' ,/-')

    level_match = _RE_LEVEL.match(text)
    if level_match:
        tokens['level'] = level_match.group(1)
        text = text[level_match.end():].lstrip(' ,/-')

    parts = [p.strip(',.') for p in text.split() if p.strip(',.')]

    if parts and re.match(r'^\d{4}$', parts[-1]):
        tokens['postcode'] = parts.pop()

    if parts and parts[-1].lower() in _STATES:
        tokens['state'] = parts.pop().upper()

    if parts and re.match(r'^\d+\w?$', parts[0]):
        tokens['number'] = parts.pop(0)
        if parts and re.match(r'^-?\d+\w?$', parts[0]):
            parts.pop(0)

    for i in range(len(parts) - 1, -1, -1):
        if parts[i].lower() in _STREET_TYPES:
            tokens['type'] = parts.pop(i).upper()
            break

    if len(parts) >= 3:
        tokens['street'] = ' '.join(parts[:-1])
        tokens['locality'] = parts[-1]
    elif len(parts) == 2:
        tokens['street'] = parts[0]
        tokens['locality'] = parts[1]
    elif len(parts) == 1:
        tokens['street'] = parts[0]

    return tokens

if __name__ == "__main__":
    addresses = ["1 martin pl sydney", "unit 5 100 St Georges Tce Perth", "3/42 smith st fitzroy"]
    for addr in addresses:
        print(f"Address: {addr}")
        print(f"Tokens:  {tokenize_address(addr)}")
        print("-" * 20)
