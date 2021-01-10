#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, os, re

reStatic = re.compile(r'"\./([^/]+)/(.+?)"')
reDynamic = re.compile(r'''http(s?)://([^/]+)([/'"])''')
reOther = re.compile(r'(\.下载|\.download)"')
subStatic = r'"../static/{}/\2?:HTTPA"'
subDynamic = r'http\1://error\3'
subOther = r'"'

def copyhtml(inpath, oupath, sitename):
    with open(inpath, 'r', encoding='utf-8') as hin, open(oupath, 'w', encoding='utf-8') as hout:
        content = hin.read()
        content = reOther.sub(subOther, content)
        content = reStatic.sub(subStatic.format(sitename), content)
        content = reDynamic.sub(subDynamic, content)
        hout.write(content)
def copy(inpath, oupath):
     with open(inpath, 'rb') as fin, open(oupath, 'wb') as fout:
        fout.write(fin.read())

def main(sitename):
    os.mkdir(sitename)
    os.mkdir(os.path.join('./static', sitename))
    for fn in os.listdir('./download'):
        if fn.endswith('.html'):
            copyhtml(os.path.join('./download', fn), os.path.join(sitename, 'index.html'), sitename)
        else:
            curdir = os.path.join('./download', fn)
            for stn in os.listdir(curdir):
                inpath = os.path.join(curdir, stn)
                if stn.endswith('.下载'):
                    stn = stn[:-3]
                elif stn.endswith('.download'):
                    stn = stn[:-9]
                oupath = os.path.join('./static', sitename, stn)
                if inpath.endswith('.html'):
                    try:
                        copyhtml(inpath, oupath, sitename)
                    except:
                        copy(inpath, oupath)
                else:
                    copy(inpath, oupath)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: ./mksite.py website.com')
    else:
        main(sys.argv[1])
