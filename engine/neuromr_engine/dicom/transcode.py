"""Re-encode phantom DICOM files with compressed transfer syntaxes (development only, uses GDCM).

The application decodes these syntaxes (GEN-238); the encoded phantoms are its test data.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Codec:
    key: str
    uid: str
    bits: int
    lossy: bool


# Bits stored per syntax: baseline JPEG holds 8-bit samples, extended JPEG 12-bit.
CODECS: tuple[Codec, ...] = (
    Codec("jpeg-baseline", "1.2.840.10008.1.2.4.50", 8, True),
    Codec("jpeg-extended", "1.2.840.10008.1.2.4.51", 12, True),
    Codec("jpeg-lossless", "1.2.840.10008.1.2.4.57", 16, False),
    Codec("jpeg-lossless-sv1", "1.2.840.10008.1.2.4.70", 16, False),
    Codec("jpeg-ls", "1.2.840.10008.1.2.4.80", 16, False),
    Codec("jpeg-ls-near", "1.2.840.10008.1.2.4.81", 16, True),
    Codec("j2k-lossless", "1.2.840.10008.1.2.4.90", 16, False),
    Codec("j2k", "1.2.840.10008.1.2.4.91", 16, True),
    Codec("rle", "1.2.840.10008.1.2.5", 16, False),
)


def _jpeg12(src: Path, dst: Path, codec: Codec) -> None:
    """12-bit extended JPEG (SOF1). GDCM encodes lossy JPEG at the allocated 16 bits, which is not
    a valid JPEG precision, so this one is written with libjpeg-turbo (imagecodecs) instead."""
    import imagecodecs
    import pydicom
    from pydicom.encaps import encapsulate
    from pydicom.uid import UID

    ds = pydicom.dcmread(src)
    frame = imagecodecs.jpeg8_encode(ds.pixel_array, level=95, bitspersample=12)
    ds.PixelData = encapsulate([frame])
    ds["PixelData"].VR = "OB"
    ds.file_meta.TransferSyntaxUID = UID(codec.uid)
    ds.save_as(dst, enforce_file_format=True)


def transcode(src: Path, dst: Path, codec: Codec) -> None:
    if codec.key == "jpeg-extended":
        _jpeg12(src, dst, codec)
        _mark_lossy(dst, codec)
        return
    import gdcm  # dev dependency (python-gdcm), only needed to build codec phantoms
    import pydicom
    from pydicom.uid import UID

    ds = pydicom.dcmread(src)  # read first: src and dst may be the same file
    reader = gdcm.ImageReader()
    reader.SetFileName(str(src))
    if not reader.Read():
        raise RuntimeError(f"GDCM could not read {src}")
    change = gdcm.ImageChangeTransferSyntax()
    change.SetTransferSyntax(gdcm.TransferSyntax(gdcm.TransferSyntax.GetTSType(codec.uid)))
    change.SetInput(reader.GetImage())
    if codec.key == "jpeg-baseline":
        jpeg = gdcm.JPEGCodec()
        jpeg.SetLossless(False)
        jpeg.SetQuality(95)
        change.SetUserCodec(jpeg)
    elif codec.key == "jpeg-ls-near":
        jls = gdcm.JPEGLSCodec()
        jls.SetLossless(False)
        jls.SetLossyError(2)
        change.SetUserCodec(jls)
    elif codec.key == "j2k":
        j2k = gdcm.JPEG2000Codec()
        j2k.SetRate(0, 10)
        change.SetUserCodec(j2k)
    if not change.Change():
        raise RuntimeError(f"GDCM could not encode {src} as {codec.key}")
    writer = gdcm.ImageWriter()
    writer.SetFileName(str(dst))
    writer.SetFile(reader.GetFile())
    writer.SetImage(change.GetOutput())
    if not writer.Write():
        raise RuntimeError(f"GDCM could not write {dst}")
    # GDCM rewrites the header of MR images (it drops Rescale and Image Position, for example), so
    # only its encoded pixel data is kept: the source dataset gets the new pixel data and syntax.
    encoded = pydicom.dcmread(dst)
    ds.PixelData = encoded.PixelData
    ds["PixelData"].VR = "OB"
    ds.file_meta.TransferSyntaxUID = UID(codec.uid)
    ds.save_as(dst, enforce_file_format=True)
    _mark_lossy(dst, codec)


def _mark_lossy(dst: Path, codec: Codec) -> None:
    if codec.lossy:
        # Record the lossy compression the way a scanner or PACS would (0028,2110…2114).
        import pydicom

        ds = pydicom.dcmread(dst)
        ds.LossyImageCompression = "01"
        ds.LossyImageCompressionMethod = _method(codec.key)
        ds.save_as(dst, enforce_file_format=True)


def _method(key: str) -> str:
    """Lossy Image Compression Method (0028,2114) for a codec key."""
    if key.startswith("jpeg-ls"):
        return "ISO_14495_1"
    return "ISO_15444_1" if key.startswith("j2k") else "ISO_10918_1"
