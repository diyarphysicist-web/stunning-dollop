from setuptools import setup, find_packages

setup(
    name="ccta_viewer",
    version="0.1.0",
    description="Coronary CT Angiography DICOM Viewer",
    author="stunning-dollop contributors",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "pydicom>=2.4",
        "numpy>=1.24",
        "scipy>=1.11",
        "scikit-image>=0.22",
        "PyQt5>=5.15",
        "pyqtgraph>=0.13",
        "vtk>=9.2",
        "matplotlib>=3.8",
        "imageio>=2.31",
    ],
    entry_points={
        "console_scripts": [
            "ccta-viewer=ccta_viewer.main:main",
        ],
    },
)
