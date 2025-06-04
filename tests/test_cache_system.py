import unittest
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from sources.cache import Cache
from sources.llm_provider import Provider

class TestCache(unittest.TestCase):
    def setUp(self):
        self.cache_dir = '.test_cache'
        self.cache_file = 'cache.json'
        self.cache = Cache(self.cache_dir, self.cache_file)

    def tearDown(self):
        if os.path.exists(self.cache_dir):
            for name in os.listdir(self.cache_dir):
                os.remove(os.path.join(self.cache_dir, name))
            os.rmdir(self.cache_dir)

    def test_add_and_retrieve(self):
        self.cache.add_message_pair('hello', 'hi')
        self.assertTrue(self.cache.is_cached('hello'))
        self.assertEqual(self.cache.get_cached_response('hello'), 'hi')
        # reload to verify persistence
        new_cache = Cache(self.cache_dir, self.cache_file)
        self.assertTrue(new_cache.is_cached('hello'))
        self.assertEqual(new_cache.get_cached_response('hello'), 'hi')

class TestProviderCache(unittest.TestCase):
    def setUp(self):
        self.cache_dir = '.prov_cache'
        self.provider = Provider('test', 'model')
        self.provider.available_providers['test'] = lambda h, v=False: 'answer'
        self.provider.cache = Cache(self.cache_dir, 'p.json')

    def tearDown(self):
        if os.path.exists(self.cache_dir):
            for name in os.listdir(self.cache_dir):
                os.remove(os.path.join(self.cache_dir, name))
            os.rmdir(self.cache_dir)

    def test_provider_uses_cache(self):
        history = [{'role': 'user', 'content': 'hi'}]
        res1 = self.provider.respond(history, verbose=False)
        self.assertEqual(res1, 'answer')
        # change backend to simulate failure if called again
        self.provider.available_providers['test'] = lambda h, v=False: 'wrong'
        res2 = self.provider.respond(history, verbose=False)
        self.assertEqual(res2, 'answer')

if __name__ == '__main__':
    unittest.main()
