#!/usr/bin/env python
'''
NodeODX App and REST API to access ODX. 
Copyright (C) 2026 NodeODX Contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
'''

import sys
import importlib.util
import importlib.machinery
import types
import argparse
import json
import os

def load_source(module_name, filename):
    if not os.path.isfile(filename) and os.path.isfile(os.path.splitext(filename)[0] + ".pyc"):
        loader = importlib.machinery.SourcelessFileLoader(module_name, os.path.splitext(filename)[0] + ".pyc")
    else:
        loader = importlib.machinery.SourceFileLoader(module_name, filename)
    module = types.ModuleType(loader.name)
    module.__file__ = filename
    loader.exec_module(module)
    return module

dest_file = os.environ.get("ODX_OPTIONS_TMP_FILE")

sys.path.append(sys.argv[2])
config = None

for module_dir in ["modules", "opendm"]:
    if os.path.isdir(os.path.join(sys.argv[2], module_dir)):
        try:
            load_source(module_dir, sys.argv[2] + f"/{module_dir}/__init__.py")
        except:
            pass
        try:
            load_source('context', sys.argv[2] + f"/{module_dir}/context.py")
        except:
            pass
        config = load_source('config', sys.argv[2] + f"/{module_dir}/config.py")
        
        break
    
options = {}
class ArgumentParserStub(argparse.ArgumentParser):
	def add_argument(self, *args, **kwargs):
		argparse.ArgumentParser.add_argument(self, *args, **kwargs)
		options[args[0]] = {}
		for name, value in kwargs.items():
			options[args[0]][str(name)] = str(value)
	
	def add_mutually_exclusive_group(self):
		return ArgumentParserStub()

if not hasattr(config, 'parser'):
    # ODM >= 2.0
    config.config(parser=ArgumentParserStub())
else:
    # ODM 1.0
    config.parser = ArgumentParserStub()
    config.config()
    
out = json.dumps(options)
print(out)
if dest_file is not None:
    with open(dest_file, "w") as f:
        f.write(out)
