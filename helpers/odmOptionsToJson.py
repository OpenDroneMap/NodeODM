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
import importlib
import argparse
import json
import os

dest_file = os.environ.get("ODM_OPTIONS_TMP_FILE")

sys.path.append(sys.argv[2])

try:
    importlib.util.spec_from_file_location('opendm',sys.argv[2] + '/opendm/__init__.py').loader.load_module()
except:
    pass
try:
    importlib.util.spec_from_file_location('context', sys.argv[2] + '/opendm/context.py').loader.load_module()
except:
    pass
odm = importlib.util.spec_from_file_location('config', sys.argv[2] + '/opendm/config.py').loader.load_module()

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
