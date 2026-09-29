Pod::Spec.new do |s|
  s.name           = 'BackgroundTimers'
  s.version        = '0.1.0'
  s.summary        = 'Timers that keep firing while the app is in the background'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'DialStack'
  s.homepage       = 'https://dialstack.ai'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,swift}"
end
