import os

from setuptools import find_packages, setup


# perform the install
setup(
    name='dive_tasks',
    description='DIVE Worker Tasks',
    setup_requires=[
        'setuptools-scm<7 ; python_version < "3.7"',
        'setuptools-scm ; python_version >= "3.7"',
        'setuptools-git',
    ],
    author='Kitware, Inc.',
    author_email='kitware@kitware.com',
    url='https://kitware.github.io/dive/',
    license='Apache 2.0',
    classifiers=[
        'Development Status :: 5 - Production/Stable',
        'Environment :: Web Environment',
        'License :: OSI Approved :: Apache Software License',
        'Operating System :: OS Independent',
        'Programming Language :: Python',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8',
    ],
    include_package_data=True,
    packages=find_packages(exclude=['plugin_tests']),
    zip_safe=False,
    install_requires=['girder>=3', 'ffmpeg>=1.4'],
    entry_points={
        'girder.plugin': [
            'jobs = girder_jobs:JobsPlugin'
        ]
    }
)