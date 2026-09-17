#!/usr/bin/env python
'''
NodeODM App and REST API to access ODM. 
Copyright (C) 2016 NodeODM Contributors

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
    loader = importlib.machinery.SourceFileLoader(module_name, filename)
    module = types.ModuleType(loader.name)
    module.__file__ = filename
    loader.exec_module(module)
    return module

dest_file = os.environ.get("ODM_OPTIONS_TMP_FILE")

if len(sys.argv) <= 2 or not sys.argv[2]:
    sys.exit("Missing or invalid project path argument")

project_path = os.path.realpath(sys.argv[2])
if not os.path.isdir(project_path):
    sys.exit("Project path does not exist or is not a directory: %s" % project_path)

sys.path.append(project_path)

try:
    load_source('opendm', os.path.join(project_path, 'opendm', '__init__.py'))
except:
    pass
try:
    load_source('context', os.path.join(project_path, 'opendm', 'context.py'))
except:
    pass
odm = load_source('config', os.path.join(project_path, 'opendm', 'config.py'))

options = {}
class ArgumentParserStub(argparse.ArgumentParser):
	def add_argument(self, *args, **kwargs):
		argparse.ArgumentParser.add_argument(self, *args, **kwargs)
		options[args[0]] = {}
		for name, value in kwargs.items():
			options[args[0]][str(name)] = str(value)
	
	def add_mutually_exclusive_group(self):
		return ArgumentParserStub()

if not hasattr(odm, 'parser'):
    # ODM >= 2.0
    odm.config(parser=ArgumentParserStub())
else:
    # ODM 1.0
    odm.parser = ArgumentParserStub()
    odm.config()
    
out = json.dumps(options)
print(out)
if dest_file is not None:
    with open(dest_file, "w") as f:
        f.write(out)
