Pod::Spec.new do |s|
  s.name           = 'ClackHaptics'
  s.version        = '1.0.0'
  s.summary        = 'Key strikes on the Taptic Engine'
  s.description    = 'Plays custom Core Haptics events, stronger and sharper than the system presets.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
