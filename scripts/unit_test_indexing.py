import os
import unittest
from unittest.mock import MagicMock, patch
import sys
import json

# Add the lambda directory to path
sys.path.append(os.path.join(os.getcwd(), 'backend', 'lambdas', 'loader'))
from index import run_loader, normalize_index_name

class TestOpenSearchLogic(unittest.TestCase):

    def setUp(self):
        # Mock environment variables
        os.environ['OPENSEARCH_ENDPOINT'] = 'localhost'
        os.environ['DB_SECRET_ARN'] = 'arn:aws:secretsmanager:region:account:secret:id'
        os.environ['AWS_REGION'] = 'ap-southeast-2'

    @patch('index.get_db_creds')
    @patch('index.boto3.Session')
    @patch('opensearchpy.OpenSearch')
    def test_normalize_index_name(self, mock_os, mock_session, mock_creds):
        self.assertEqual(normalize_index_name("GNAF"), "gnaf")
        self.assertEqual(normalize_index_name("Feb 2026 G-NAF"), "feb-2026-g-naf")
        self.assertEqual(normalize_index_name("Complex_Index@Name"), "complex-index-name")
        self.assertEqual(normalize_index_name("-leading-trailing-"), "leading-trailing")

    @patch('index.get_db_creds')
    @patch('index.boto3.Session')
    @patch('opensearchpy.OpenSearch')
    def test_update_alias_conflict_resolution(self, mock_os_class, mock_session, mock_creds):
        # Setup mocks
        mock_os_client = MagicMock()
        mock_os_class.return_value = mock_os_client
        mock_creds.return_value = {"username": "u", "password": "p"}
        
        # Scenario: Physical index 'gnaf' exists, blocking alias 'gnaf'
        mock_os_client.indices.exists.return_value = True
        mock_os_client.indices.exists_alias.return_value = False # It's an index, not an alias
        
        event = {
            "mode": "UPDATE_ALIAS",
            "alias_name": "gnaf",
            "index_name": "gnaf-2026-02-21"
        }
        
        run_loader(event)
        
        # Verify physical index was deleted
        mock_os_client.indices.delete.assert_called_with(index="gnaf")
        # Verify alias was updated with only ADD (since it wasn't an alias before)
        mock_os_client.indices.update_aliases.assert_called()
        args, kwargs = mock_os_client.indices.update_aliases.call_args
        actions = kwargs['body']['actions']
        self.assertEqual(len(actions), 1) # Only 'add'
        self.assertEqual(actions[0]['add']['alias'], "gnaf")

    @patch('index.get_db_creds')
    @patch('index.boto3.Session')
    @patch('opensearchpy.OpenSearch')
    def test_update_alias_existing_alias(self, mock_os_class, mock_session, mock_creds):
        mock_os_client = MagicMock()
        mock_os_class.return_value = mock_os_client
        mock_creds.return_value = {"username": "u", "password": "p"}
        
        # Scenario: Alias already exists (no physical index conflict)
        mock_os_client.indices.exists.return_value = True
        mock_os_client.indices.exists_alias.return_value = True
        
        event = {
            "mode": "UPDATE_ALIAS",
            "alias_name": "gnaf",
            "index_name": "gnaf-2026-02-21"
        }
        
        run_loader(event)
        
        # Verify physical index was NOT deleted
        mock_os_client.indices.delete.assert_not_called()
        # Verify alias was updated with REMOVE and ADD
        mock_os_client.indices.update_aliases.assert_called()
        args, kwargs = mock_os_client.indices.update_aliases.call_args
        actions = kwargs['body']['actions']
        self.assertEqual(len(actions), 2) # 'remove' and 'add'
        self.assertEqual(actions[0]['remove']['alias'], "gnaf")
        self.assertEqual(actions[1]['add']['alias'], "gnaf")

    @patch('index.get_db_creds')
    @patch('index.boto3.Session')
    @patch('opensearchpy.OpenSearch')
    def test_update_alias_no_conflict(self, mock_os_class, mock_session, mock_creds):
        mock_os_client = MagicMock()
        mock_os_class.return_value = mock_os_client
        mock_creds.return_value = {"username": "u", "password": "p"}
        
        # Scenario: Alias already exists or doesn't exist at all (no physical index conflict)
        mock_os_client.indices.exists.return_value = False
        
        event = {
            "mode": "UPDATE_ALIAS",
            "alias_name": "gnaf",
            "index_name": "gnaf-2026-02-21"
        }
        
        run_loader(event)
        
        # Verify physical index was NOT deleted
        mock_os_client.indices.delete.assert_not_called()
        # Verify alias was updated
        mock_os_client.indices.update_aliases.assert_called()

    @patch('index.get_db_creds')
    @patch('index.boto3.Session')
    @patch('opensearchpy.OpenSearch')
    def test_index_opensearch_naming(self, mock_os_class, mock_session, mock_creds):
        mock_os_client = MagicMock()
        mock_os_class.return_value = mock_os_client
        mock_creds.return_value = {"username": "u", "password": "p"}
        mock_os_client.indices.exists.return_value = False
        
        event = {
            "mode": "INDEX_OPENSEARCH",
            "index_name": "Feb 2026 G-NAF",
            "create_index": True
        }
        
        run_loader(event)
        
        # Verify index was created with normalized name
        mock_os_client.indices.create.assert_called()
        args, kwargs = mock_os_client.indices.create.call_args
        self.assertEqual(kwargs['index'], "feb-2026-g-naf")

if __name__ == '__main__':
    unittest.main()
