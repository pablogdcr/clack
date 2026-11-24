import CoreHaptics
import ExpoModulesCore

/**
 The system's impact presets stop short of what the Taptic Engine can do. This plays a single
 event built by hand: a transient at any intensity and sharpness, optionally followed at once
 by a very short buzz, which is what gives a blow its weight.
 */
public class ClackHapticsModule: Module {
  private var engine: CHHapticEngine?
  private var running = false

  public func definition() -> ModuleDefinition {
    Name("ClackHaptics")

    Function("isSupported") {
      CHHapticEngine.capabilitiesForHardware().supportsHaptics
    }

    // Starts the engine ahead of the first key, so that it is not late.
    Function("prepare") {
      self.start()
    }

    // intensity and sharpness run from 0 to 1; body is the length of the buzz in seconds.
    Function("tap") { (intensity: Double, sharpness: Double, body: Double) in
      self.tap(intensity: Float(intensity), sharpness: Float(sharpness), body: body)
    }
  }

  private func start() {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics, !running else {
      return
    }
    do {
      if engine == nil {
        let made = try CHHapticEngine()
        made.playsHapticsOnly = true
        made.isAutoShutdownEnabled = false
        // The system stops the engine when the app leaves the screen; it is started again
        // on the next key.
        made.stoppedHandler = { [weak self] _ in self?.running = false }
        made.resetHandler = { [weak self] in
          self?.running = false
          self?.start()
        }
        engine = made
      }
      try engine?.start()
      running = true
    } catch {
      running = false
    }
  }

  private func tap(intensity: Float, sharpness: Float, body: Double) {
    start()
    guard running, let engine else {
      return
    }
    let parameters = [
      CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
      CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
    ]
    var events = [CHHapticEvent(eventType: .hapticTransient, parameters: parameters, relativeTime: 0)]
    if body > 0 {
      events.append(CHHapticEvent(eventType: .hapticContinuous, parameters: parameters, relativeTime: 0, duration: body))
    }
    do {
      let pattern = try CHHapticPattern(events: events, parameters: [])
      try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
    } catch {
      running = false
    }
  }
}
