import json
from pathlib import Path

class Cache:
    def __init__(self, cache_dir: str = '.cache', cache_file: str = 'messages.json'):
        self.cache_dir = Path(cache_dir)
        self.cache_file = self.cache_dir / cache_file
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        if not self.cache_file.exists():
            self.cache_file.write_text('[]')
        with open(self.cache_file, 'r') as f:
            try:
                self.cache = json.load(f)
                if not isinstance(self.cache, list):
                    self.cache = []
            except json.JSONDecodeError:
                self.cache = []

    def add_message_pair(self, user_message: str, assistant_message: str) -> None:
        if not any(entry.get('user') == user_message for entry in self.cache):
            self.cache.append({'user': user_message, 'assistant': assistant_message})
            self._save()

    def is_cached(self, user_message: str) -> bool:
        return any(entry.get('user') == user_message for entry in self.cache)

    def get_cached_response(self, user_message: str):
        for entry in self.cache:
            if entry.get('user') == user_message:
                return entry.get('assistant')
        return None

    def _save(self) -> None:
        with open(self.cache_file, 'w') as f:
            json.dump(self.cache, f, indent=2)
