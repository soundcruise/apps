// Read-only mounted-image metadata. Never mounts, unlocks, creates or changes a disk.
import Foundation
func plist(_ tool:String,_ args:[String]) throws -> [String:Any] {
 let p=Process();p.executableURL=URL(fileURLWithPath:tool);p.arguments=args
 let out=Pipe();p.standardOutput=out;p.standardError=FileHandle.nullDevice;try p.run()
 let data=out.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
 guard p.terminationStatus==0 else {throw NSError(domain:"metadata",code:1)}
 return try PropertyListSerialization.propertyList(from:data,format:nil) as? [String:Any] ?? [:]
}
do {
 guard CommandLine.arguments.count==3 else {exit(2)}
 let mount=CommandLine.arguments[1], image=CommandLine.arguments[2]
 let info=try plist("/usr/sbin/diskutil",["info","-plist",mount])
 let images=try plist("/usr/bin/hdiutil",["info","-plist"])["images"] as? [[String:Any]] ?? []
 let matches=images.filter{x in x["image-path"] as? String==image && (x["system-entities"] as? [[String:Any]] ?? []).contains{ $0["mount-point"] as? String==mount && $0["dev-entry"] as? String=="/dev/"+(info["DeviceIdentifier"] as? String ?? "") }}
 let o:[String:Any]=["volumeUUID":info["VolumeUUID"] ?? "","mountPoint":info["MountPoint"] ?? "","deviceIdentifier":info["DeviceIdentifier"] ?? "","filesystem":info["FilesystemType"] ?? "","encrypted":info["FileVault"] as? Bool==true,"locked":info["Locked"] as? Bool ?? true,"imageAttached":matches.count==1]
 FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:o,options:.sortedKeys))
} catch { print("{\"status\":\"UNVERIFIED\"}");exit(1) }
