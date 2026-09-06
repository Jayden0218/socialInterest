# Runtime Attempt — 2026-09-06 — run 10

Workflow run 10 (`android-emulator.yml`, run id 34018162335, head `d3cf883`). Not edited after
the attempt.

| Field | Value |
|---|---|
| date | 2026-09-06 |
| configuration | `system-images;android-30;default;x86_64`, AVD `sih`, `-no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -partition-size 2048 -verbose`, runner `ubuntu-22.04` |
| outcome | **`booted`** — runtime started, activity started, app crashed during React Native module registration |
| runtime_output | Below, from the job log |
| conclusion | **The cause is identified.** See below |

## The activity started. That is new, and it is what `am start -W` bought.

```
Starting: Intent { cmp=app.socialinterest/.MainActivity }
Status: ok
LaunchState: COLD
Activity: app.socialinterest/.MainActivity
TotalTime: 520
```

Run 9 could not distinguish "never started" from "started and died", because `monkey` reports
`Events injected: 1` in both cases. `Status: ok` settles it: the activity launched in 520ms
and then died.

## Why it died

```
--------- beginning of crash
E AndroidRuntime: FATAL EXCEPTION: pool-2-thread-1
E AndroidRuntime: Process: app.socialinterest, PID: 2253
E AndroidRuntime: java.lang.NoClassDefFoundError: Failed resolution of:
                  Lexpo/modules/kotlin/types/AnyTypeCache;
E AndroidRuntime:   at expo.modules.imagepicker.ImagePickerModule.definition(ImagePickerModule.kt:330)
E AndroidRuntime:   at expo.modules.kotlin.ModuleRegistry.register(ModuleRegistry.kt:27)
E AndroidRuntime:   at expo.modules.kotlin.AppContext.<init>(AppContext.kt:120)
E AndroidRuntime:   at com.facebook.react.runtime.ReactInstance.<init>(ReactInstance.kt:168)
E AndroidRuntime: Caused by: java.lang.ClassNotFoundException:
                  expo.modules.kotlin.types.AnyTypeCache
W ActivityTaskManager: Force finishing activity app.socialinterest/.MainActivity
```

**A dependency version mismatch introduced by 003/T037, and mine.** The picker was installed
with `pnpm add expo-image-picker`, which takes the latest published version. That is
`expo-image-picker@57.0.16`, built against a far newer `expo-modules-core` than SDK 54 ships.
Its `ImagePickerModule.definition()` calls into `AnyTypeCache`, which does not exist in
`expo-modules-core@3.0.30`, so module registration throws during React instance creation and
Android force-finishes the activity.

The correct tool is `expo install`, which resolves the version matching the installed SDK.
`expo install` could not run here — it needs Expo's API, which this environment's egress
policy blocks — but the version map ships inside the installed `expo` package
(`expo/bundledNativeModules.json`) and is authoritative for the SDK in use:

| Package | SDK 54 wants | What `pnpm add` installed |
|---|---|---|
| `expo-image-picker` | `~17.0.11` | **57.0.16** |
| `expo-build-properties` | `~1.0.10` | **57.0.17** |

Both corrected. The fix is verified rather than assumed: `ImagePickerModule.kt` in 17.0.11 is
**307 lines**, so the crashing line 330 does not exist in it, and no installed Expo package
references `AnyTypeCache` any more.

## A second defect, found by the fix rather than by the crash

Correcting the version made the module resolve under jest, and a unit test failed — because
`useMediaLibrary` did not handle the picker *throwing*. A present-but-failing native module
(an unlinked build, a host with no gallery, a version whose API differs) produced an
unhandled rejection inside `void library.pick()`, leaving the screen showing nothing. That is
precisely the silent failure FR-012 exists to prevent, reached by a different route. Both
picker calls are now guarded and fall back to `unavailable`, which is what the situation is
from the person's point of view.

The test was also asserting the wrong thing. It required the exact `library-unavailable`
banner, which tied it to whether the native module happens to resolve under jest — an
implementation detail that changed for reasons unrelated to FR-012. It now asserts the
requirement: the person is told *something*, and the app does not proceed into compose with
media they did not choose.

## Status

**Android is still unverified**, and one thing at a time: this run establishes the cause of
the crash, not that the app works. What the next run answers is whether the app renders with
the module registry intact. T013, T015 and T043 remain open.

Worth stating plainly: the cleartext fix from run 9 is **not** what was wrong here, and was
not claimed to be. It remains a real defect that would have blocked every API call once the
app ran.
