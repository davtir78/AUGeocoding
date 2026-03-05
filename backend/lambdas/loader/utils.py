import io
import re

def normalize_index_name(name):
    """Normalize index name to be OpenSearch compatible (lowercase, no spaces)."""
    if not name: return name
    # Lowercase
    name = name.lower()
    # Replace multiple spaces with single hyphen
    name = re.sub(r'\s+', '-', name)
    # Replace invalid chars with hyphen
    name = re.sub(r'[^a-z0-9]+', '-', name)
    # Strip leading/trailing hyphens
    return name.strip('-')

class SamplerFile(io.IOBase):
    """
    Wraps a file-like object and samples lines based on a given ratio.
    Useful for loading a percentage of a large S3 file into RDS.
    """
    def __init__(self, fileobj, ratio):
        self.fileobj = fileobj
        self.ratio = ratio
        self.header = fileobj.readline()
        self.sent_header = False
        self.buffer = b""
        import random
        self.random = random

    def read(self, size=-1):
        # Always return the header first and exactly once
        if not self.sent_header:
            self.sent_header = True
            return self.header
        
        # Fill buffer until we have data or end of file
        while not self.buffer:
            line = self.fileobj.readline()
            if not line:
                return b""
            # Bernoulli sampling
            if self.random.random() < self.ratio:
                self.buffer = line
        
        # Return chunk of buffer
        if size <= 0:
            res = self.buffer
            self.buffer = b""
            return res
        else:
            res = self.buffer[:size]
            self.buffer = self.buffer[size:]
            return res
