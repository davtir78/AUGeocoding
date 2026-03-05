import sys
import os
import unittest
from unittest.mock import MagicMock

# Mock heavy dependencies before importing index
sys.modules['psycopg2'] = MagicMock()
sys.modules['opensearchpy'] = MagicMock()
sys.modules['boto3'] = MagicMock()
sys.modules['smart_open'] = MagicMock()

# Add validator lambda path to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/lambdas/validator')))

import index # Now safe to import

class TestValidatorLogic(unittest.TestCase):
    
    def test_tokenize_simple(self):
        address = "1 Martin Pl Sydney NSW 2000"
        tokens = index.tokenize_address(address)
        self.assertEqual(tokens['number'], "1")
        self.assertEqual(tokens['street'], "Martin")
        self.assertEqual(tokens['type'], "PL")
        self.assertEqual(tokens['locality'], "Sydney")
        self.assertEqual(tokens['state'], "NSW")
        self.assertEqual(tokens['postcode'], "2000")
        self.assertIsNone(tokens['flat'])
        self.assertIsNone(tokens['level'])

    def test_tokenize_unit(self):
        address = "Flat 5, 100 St Georges Tce Perth"
        tokens = index.tokenize_address(address)
        self.assertEqual(tokens['flat'], "5")
        self.assertEqual(tokens['number'], "100")
        self.assertEqual(tokens['street'], "St Georges")
        self.assertEqual(tokens['type'], "TCE")
        self.assertEqual(tokens['locality'], "Perth")

    def test_query_builder_base_address(self):
        # Case: Generic query -> Boost base addresses
        tokens = {
            'flat': None,
            'level': None,
            'number': '1',
            'street': 'Martin',
            'type': 'PL',
            'locality': 'Sydney'
        }
        query = index.build_os_query(tokens, "1 Martin Pl Sydney")
        
        # Verify that is_base_address: True is boosted
        should_clauses = query['query']['bool']['should']
        base_boost = [c for c in should_clauses if c.get('term', {}).get('is_base_address', {}).get('value') == True]
        self.assertTrue(len(base_boost) > 0)
        self.assertEqual(base_boost[0]['term']['is_base_address']['boost'], 1000.0)

    def test_query_builder_unit_address(self):
        # Case: Unit query -> Boost non-base addresses
        tokens = {
            'flat': '5',
            'level': None,
            'number': '100',
            'street': 'St Georges',
            'type': 'TCE',
            'locality': 'Perth'
        }
        query = index.build_os_query(tokens, "Flat 5 100 St Georges Tce Perth")
        
        # Verify that is_base_address: False is boosted
        should_clauses = query['query']['bool']['should']
        base_boost = [c for c in should_clauses if c.get('term', {}).get('is_base_address', {}).get('value') == False]
        self.assertTrue(len(base_boost) > 0)
        self.assertEqual(base_boost[0]['term']['is_base_address']['boost'], 200.0)

if __name__ == "__main__":
    unittest.main()
