import type { PickedMedia } from './MediaPickerScreen';

/**
 * Media the compose flow can publish without a native gallery picker.
 *
 * This build has no picker dependency, and a device journey that has to drive an
 * OS gallery dialog fails for reasons that have nothing to do with the product.
 * What J-04 and J-05 are actually about - choose an interest, upload every item,
 * publish, see it in the feed - runs end to end over the real presign/PUT/publish
 * path with these, because the bytes are real bytes and the server derives key
 * and kind from its own upload record either way.
 *
 * Replace this with a picker when one is installed; nothing downstream changes,
 * because ComposeContainer only ever receives `PickedMedia[]`.
 */

/** A 1x1 PNG. Small enough to inline, real enough to upload and transcode. */
const PNG_1X1 =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * A 1-second 64x64 H.264 clip. 001/FR-005 and FR-009 needed one and there was
 * none, so the video path had never been published from the app at all - and
 * SC-011 ("a video plays on a device") had nothing to run.
 *
 * Inlined for the same reason the PNG is: an emulator has no camera roll, and a
 * journey that has to drive an OS gallery dialog fails for reasons that have
 * nothing to do with the product.
 */
const MP4_1S =
  'data:video/mp4;base64,' +
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAOPbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAA' +
  'AAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAA' +
  'Arp0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAA' +
  'AAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAQAAABAAAAAAIybWRpYQAAACBtZGhk' +
  'AAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB3W1p' +
  'bmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAZ1zdGJsAAAAvXN0c2QA' +
  'AAAAAAAAAQAAAK1hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMCBsaWJ4' +
  'MjY0AAAAAAAAAAAAAAAAGP//AAAAM2F2Y0MBZAAK/+EAGGdkAAqs2UQmwEQAAAMABAAAAwBAPEiWWAEABGjvj8v9+PgAAAAAEHBh' +
  'c3AAAAABAAAAAQAAABRidHJ0AAAAAAAANugAAAAAAAAAGHN0dHMAAAAAAAAAAQAAAAgAAAgAAAAAFHN0c3MAAAAAAAAAAQAAAAEA' +
  'AABIY3R0cwAAAAAAAAAHAAAAAQAAEAAAAAABAAAoAAAAAAEAABAAAAAAAQAAAAAAAAABAAAIAAAAAAEAACAAAAAAAgAACAAAAAAc' +
  'c3RzYwAAAAAAAAABAAAAAQAAAAgAAAABAAAANHN0c3oAAAAAAAAAAAAAAAgAAAW7AAAAegAAABgAAAAMAAAADAAAAE4AAAAbAAAA' +
  'DwAAABRzdGNvAAAAAAAAAAEAAAO/AAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAA' +
  'AAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2My4xLjEwMAAAAAhmcmVlAAAG5W1kYXQAAAKeBgX//5rcRem95tlI' +
  't5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0' +
  'dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTEgZGVibG9jaz0xOjA6MCBhbmFs' +
  'eXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9MiBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0wIG1lX3JhbmdlPTE2' +
  'IGNocm9tYV9tZT0xIHRyZWxsaXM9MCA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3Fw' +
  'X29mZnNldD0wIHRocmVhZHM9MiBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGlu' +
  'dGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFw' +
  'dD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MSBrZXlpbnQ9MjUwIGtleWludF9taW49' +
  'OCBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTEwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29t' +
  'cD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAxVliIQAn+1zw0px/gtZ' +
  '2P4Cj4J3NyQ12+nO9F1hxS4IovTA89XOIAiXoLIKtnXLu77WY1zbmTrmx8/OwBsFF/MXhjDFeMJaHllX79So5ewIA8edX/peQ5yi' +
  'OJKk8Neh3VMHl/mUV9Nys2ORYpnRbvTiasTHX/az2pD2qMn7dXVcgQtOstO4pL3hEA5NfzoNUZbNfv/65MyjCInIrmMdCmLbFj1Q' +
  'seNuT8NMHgoSB+2k0fDbf/0MZGQ4hh9Ft0ngk9WlCbpbI2VrU/7eNd+kxJkw751y2rsAzN8r4Klq6mgMIhKD8+Warot5FVbYrThR' +
  'mtOprWAoAtRm3TKpaCqR3IvKWEJGxHDbv26PivempaeO4BiutrRQSqJeDdfUo5PV4x5Idu0bH4Ibd4fMJRRbI9tAal7OFXHxqm7J' +
  '3yM/ifFzVIn5wu+7KRLNH9+aLiUqNEr7tDtguFl0A4uMW4SxPKmBafOy/8USQcU6qZX/nv66rPsIDqSSJnOBiVR4KdvZk/07c0XA' +
  '0aeLAkUiSS21FhNCCm2/CqKHCRbPr/+fX2GnHurgPuOdPX5QKEJBPHI6fYbMP+GKqphTUMcGn9IIDXgTNsQF2Tp8FwfDieD2Ouou' +
  'ix+4pD+s5mH4p7Hxc3OwYPweU6cdhGHaIsYFdq8BgT1pTIbHXty7NJ5aE7QBoiqVl7SJ9N1tQYWEH2fdiESwV98OHEB56BtqKqwM' +
  'lTOAd3Qch7ZyMWqguDHCk8FH0562hlqLiT42Saegp90Mtlb15XX0XbDh1r6wLqmfnlmgbCpe6rh0y4YdPG4GGbcCwlETWuaWRdT+' +
  'hjT9L5BJYhkQ8zuzwb1EGd4WRn/3uQib2H8+UDPXAmTM+tN38ibBzjLBq3O/+M1Wsn4v4qjlCue9odQB8TxiC8VAFPF2PUI/a2KN' +
  'u5ZfO98+0f+VRucHDUGelW7RjybRNPa8yZvA9g2MEr907w4Wo2/+WgoXpYYC38EkVuazF27v8AkX1VBw7PNAPYhbYqcTs6HM6rPC' +
  'xANCW6AmXXFOOBI3PhPrrTbH/0UgUkp/E+0AAAB2QZokGIj/NsGE+ZWvqwGzx6RDbUzfD8KTuEuVB82T/sRP/+QS/slrbB8UZLX/' +
  'KSc8kdaGchrYXTl5T1mBuFDa+LAqY6ddKeNrb/H39MLGYr4aet54Q0W12RGVqWeIoBgYJffiHvTqPP80fuy2/3kQaKiqm/li+AAA' +
  'ABRBnkJCM/9hIQVF1lAGAdxl82224QAAAAgBnmFEIf9YQAAAAAgBnmNEIf9YQQAAAEpBmmc0TEIfEMAgDcOvEOobyfKvfpNt2kg1' +
  '2xeDMpetlc7DrgEfwMNmxugN3Whw5tBGaHIMF7YlctzVpInlBPJbL8rLrsWivdNoQQAAABdBnoVFESx3Y+X/vo30yJB3Vnmr9ZbY' +
  'gQAAAAsBnqZEIf9qtnt/QQ==';

export const SAMPLE_MEDIA: PickedMedia[] = [
  // 70, not 68. The declared length is what the app tells the server when it
  // asks for an upload target, and it was two bytes short of what the base64
  // actually decodes to - so the app announced one size and uploaded another.
  // Caught by readMediaBytes.test.ts asserting the two agree, which is the
  // whole reason that assertion is there.
  { uri: PNG_1X1, kind: 'image', contentType: 'image/png', sizeBytes: 70 },
  // sizeBytes is what the app TELLS the server when it asks for an upload
  // target, and the PNG's was two bytes short of what its base64 decodes to.
  // This one is measured from the file, not counted by hand.
  { uri: MP4_1S, kind: 'video', contentType: 'video/mp4', sizeBytes: 2716, durationMs: 1000 },
];
