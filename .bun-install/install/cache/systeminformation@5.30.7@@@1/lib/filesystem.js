'use strict';
// @ts-check
// ==================================================================================
// filesystem.js
// ----------------------------------------------------------------------------------
// Description:   System Information - library
//                for Node.js
// Copyright:     (c) 2014 - 2026
// Author:        Sebastian Hildebrandt
// ----------------------------------------------------------------------------------
// License:       MIT
// ==================================================================================
// 8. File System
// ----------------------------------------------------------------------------------

const util = require('./util');
const fs = require('fs');

const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const execPromiseSave = util.promisifySave(require('child_process').exec);

const _platform = process.platform;

const _linux = _platform === 'linux' || _platform === 'android';
const _darwin = _platform === 'darwin';
const _windows = _platform === 'win32';
const _freebsd = _platform === 'freebsd';
const _openbsd = _platform === 'openbsd';
const _netbsd = _platform === 'netbsd';
const _sunos = _platform === 'sunos';

const _fs_speed = {};
const _disk_io = {};

// --------------------------
// FS - mounted file systems

function fsSize(drive, callback) {
  if (util.isFunction(drive)) {
    callback = drive;
    drive = '';
  }

  let macOsDisks = [];
  let osMounts = [];

  function getmacOsFsType(fs) {
    if (!fs.startsWith('/')) {
      return 'NFS';
    }
    const parts = fs.split('/');
    const fsShort = parts[parts.length - 1];
    const macOsDisksSingle = macOsDisks.filter((item) => item.indexOf(fsShort) >= 0);
    if (macOsDisksSingle.length === 1 && macOsDisksSingle[0].indexOf('APFS') >= 0) {
      return 'APFS';
    }
    return 'HFS';
  }

  function isLinuxTmpFs(fs) {
    const linuxTmpFileSystems = ['rootfs', 'unionfs', 'squashfs', 'cramfs', 'initrd', 'initramfs', 'devtmpfs', 'tmpfs', 'udev', 'devfs', 'specfs', 'type', 'appimaged'];
    let result = false;
    linuxTmpFileSystems.forEach((linuxFs) => {
      if (fs.toLowerCase().indexOf(linuxFs) >= 0) {
        result = true;
      }
    });
    return result;
  }

  function filterLines(stdout) {
    const lines = stdout.toString().split('\n');
    lines.shift();
    if (stdout.toString().toLowerCase().indexOf('filesystem')) {
      let removeLines = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] && lines[i].toLowerCase().startsWith('filesystem')) {
          removeLines = i;
        }
      }
      for (let i = 0; i < removeLines; i++) {
        lines.shift();
      }
    }
    return lines;
  }

  function parseDf(lines) {
    const data = [];
    lines.forEach((line) => {
      if (line !== '') {
        line = line.replace(/ +/g, ' ').split(' ');
        if (line && (line[0].startsWith('/') || (line[6] && line[6] === '/') || line[0].indexOf('/') > 0 || line[0].indexOf(':') === 1 || (!_darwin && !isLinuxTmpFs(line[1])))) {
          const fs = line[0];
          const fsType = _linux || _freebsd || _openbsd || _netbsd ? line[1] : getmacOsFsType(line[0]);
          const size = parseInt(_linux || _freebsd || _openbsd || _netbsd ? line[2] : line[1], 10) * 1024;
          const used = parseInt(_linux || _freebsd || _openbsd || _netbsd ? line[3] : line[2], 10) * 1024;
          const available = parseInt(_linux || _freebsd || _openbsd || _netbsd ? line[4] : line[3], 10) * 1024;
          const use = parseFloat((100.0 * (used / (used + available))).toFixed(2));
          const rw = osMounts && Object.keys(osMounts).length > 0 ? osMounts[fs] || false : null;
          line.splice(0, _linux || _freebsd || _openbsd || _netbsd ? 6 : 5);
          const mount = line.join(' ');
          if (!data.find((el) => el.fs === fs && el.type === fsType && el.mount === mount)) {
            data.push({
              fs,
              type: fsType,
              size,
              used,
              available,
              use,
              mount,
              rw
            });
          }
        }
      }
    });
    return data;
  }

  return new Promise((resolve) => {
    process.nextTick(() => {
      let data = [];
      if (_linux || _freebsd || _openbsd || _netbsd || _darwin) {
        let cmd = '';
        macOsDisks = [];
        osMounts = {};
        if (_darwin) {
          cmd = 'df -kP';
          try {
            macOsDisks = execSync('diskutil list')
              .toString()
              .split('\n')
              .filter((line) => {
                return !line.startsWith('/') && line.indexOf(':') > 0;
              });
            execSync('mount')
              .toString()
              .split('\n')
              .filter((line) => {
                return line.startsWith('/');
              })
              .forEach((line) => {
                osMounts[line.split(' ')[0]] = line.toLowerCase().indexOf('read-only') === -1;
              });
          } catch {
            util.noop();
          }
        }
        if (_linux) {
          try {
            cmd = 'export LC_ALL=C; df -kPTx squashfs; unset LC_ALL';
            execSync('cat /proc/mounts 2>/dev/null', util.execOptsLinux)
              .toString()
              .split('\n')
              .filter((line) => {
                return line.startsWith('/');
              })
              .forEach((line) => {
                osMounts[line.split(' ')[0]] = osMounts[line.split(' ')[0]] || false;
                if (line.toLowerCase().indexOf('/snap/') === -1) {
                  osMounts[line.split(' ')[0]] = line.toLowerCase().indexOf('rw,') >= 0 || line.toLowerCase().indexOf(' rw ') >= 0;
                }
              });
          } catch {
            util.noop();
          }
        }
        if (_freebsd || _openbsd || _netbsd) {
          try {
            cmd = 'df -kPT';
            execSync('mount')
              .toString()
              .split('\n')
              .forEach((line) => {
                osMounts[line.split(' ')[0]] = line.toLowerCase().indexOf('read-only') === -1;
              });
          } catch {
            util.noop();
          }
        }
        exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
          const lines = filterLines(stdout);
          data = parseDf(lines);
          if (drive) {
            data = data.filter((item) => {
              return item.fs.toLowerCase().indexOf(drive.toLowerCase()) >= 0 || item.mount.toLowerCase().indexOf(drive.toLowerCase()) >= 0;
            });
          }
          if ((!error || data.length) && stdout.toString().trim() !== '') {
            if (callback) {
              callback(data);
            }
            resolve(data);
          } else {
            exec('df -kPT 2>/dev/null', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
              // fixed issue alpine fallback
              const lines = filterLines(stdout);
              data = parseDf(lines);
              if (callback) {
                callback(data);
              }
              resolve(data);
            });
          }
        });
      }
      if (_sunos) {
        if (callback) {
          callback(data);
        }
        resolve(data);
      }
      if (_windows) {
        try {
          const driveSanitized = drive ? util.sanitizeShellString(drive, true) : '';
          const cmd = `Get-WmiObject Win32_logicaldisk | select Access,Caption,FileSystem,FreeSpace,Size ${driveSanitized ? '| where -property Caption -eq ' + driveSanitized : ''} | fl`;
          util.powerShell(cmd).then((stdout, error) => {
            if (!error) {
              const devices = stdout.toString().split(/\n\s*\n/);
              devices.forEach((device) => {
                const lines = device.split('\r\n');
                const size = util.toInt(util.getValue(lines, 'size', ':'));
                const free = util.toInt(util.getValue(lines, 'freespace', ':'));
                const caption = util.getValue(lines, 'caption', ':');
                const rwValue = util.getValue(lines, 'access', ':');
                const rw = rwValue ? util.toInt(rwValue) !== 1 : null;
                if (size) {
                  data.push({
                    fs: caption,
                    type: util.getValue(lines, 'filesystem', ':'),
                    size,
                    used: size - free,
                    available: free,
                    use: parseFloat(((100.0 * (size - free)) / size).toFixed(2)),
                    mount: caption,
                    rw
                  });
                }
              });
            }
            if (callback) {
              callback(data);
            }
            resolve(data);
          });
        } catch {
          if (callback) {
            callback(data);
          }
          resolve(data);
        }
      }
    });
  });
}

exports.fsSize = fsSize;

// --------------------------
// FS - open files count

function fsOpenFiles(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      const result = {
        max: null,
        allocated: null,
        available: null
      };
      if (_freebsd || _openbsd || _netbsd || _darwin) {
        const cmd = 'sysctl -i kern.maxfiles kern.num_files kern.open_files';
        exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (!error) {
            const lines = stdout.toString().split('\n');
            result.max = parseInt(util.getValue(lines, 'kern.maxfiles', ':'), 10);
            result.allocated = parseInt(util.getValue(lines, 'kern.num_files', ':'), 10) || parseInt(util.getValue(lines, 'kern.open_files', ':'), 10);
            result.available = result.max - result.allocated;
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_linux) {
        fs.readFile('/proc/sys/fs/file-nr', (error, stdout) => {
          if (!error) {
            const lines = stdout.toString().split('\n');
            if (lines[0]) {
              const parts = lines[0].replace(/\s+/g, ' ').split(' ');
              if (parts.length === 3) {
                result.allocated = parseInt(parts[0], 10);
                result.available = parseInt(parts[1], 10);
                result.max = parseInt(parts[2], 10);
                if (!result.available) {
                  result.available = result.max - result.allocated;
                }
              }
            }
            if (callback) {
              callback(result);
            }
            resolve(result);
          } else {
            fs.readFile('/proc/sys/fs/file-max', (error, stdout) => {
              if (!error) {
                const lines = stdout.toString().split('\n');
                if (lines[0]) {
                  result.max = parseInt(lines[0], 10);
                }
              }
              if (callback) {
                callback(result);
              }
              resolve(result);
            });
          }
        });
      }
      if (_sunos) {
        if (callback) {
          callback(null);
        }
        resolve(null);
      }
      if (_windows) {
        if (callback) {
          callback(null);
        }
        resolve(null);
      }
    });
  });
}

exports.fsOpenFiles = fsOpenFiles;

// --------------------------
// disks

function parseBytes(s) {
  return parseInt(s.substr(s.indexOf(' (') + 2, s.indexOf(' Bytes)') - 10), 10);
}

function parseDevices(lines) {
  const devices = [];
  let i = 0;
  lines.forEach((line) => {
    if (line.length > 0) {
      if (line[0] === '*') {
        i++;
      } else {
        const parts = line.split(':');
        if (parts.length > 1) {
          if (!devices[i]) {
            devices[i] = {
              name: '',
              identifier: '',
              type: 'disk',
              fsType: '',
              mount: '',
              size: 0,
              physical: 'HDD',
              uuid: '',
              label: '',
              model: '',
              serial: '',
              removable: false,
              protocol: '',
              group: '',
              device: ''
            };
          }
          parts[0] = parts[0].trim().toUpperCase().replace(/ +/g, '');
          parts[1] = parts[1].trim();
          if ('DEVICEIDENTIFIER' === parts[0]) {
            devices[i].identifier = parts[1];
          }
          if ('DEVICENODE' === parts[0]) {
            devices[i].name = parts[1];
          }
          if ('VOLUMENAME' === parts[0]) {
            if (parts[1].indexOf('Not applicable') === -1) {
              devices[i].label = parts[1];
            }
          }
          if ('PROTOCOL' === parts[0]) {
            devices[i].protocol = parts[1];
          }
          if ('DISKSIZE' === parts[0]) {
            devices[i].size = parseBytes(parts[1]);
          }
          if ('FILESYSTEMPERSONALITY' === parts[0]) {
            devices[i].fsType = parts[1];
          }
          if ('MOUNTPOINT' === parts[0]) {
            devices[i].mount = parts[1];
          }
          if ('VOLUMEUUID' === parts[0]) {
            devices[i].uuid = parts[1];
          }
          if ('READ-ONLYMEDIA' === parts[0] && parts[1] === 'Yes') {
            devices[i].physical = 'CD/DVD';
          }
          if ('SOLIDSTATE' === parts[0] && parts[1] === 'Yes') {
            devices[i].physical = 'SSD';
          }
          if ('VIRTUAL' === parts[0]) {
            devices[i].type = 'virtual';
          }
          if ('REMOVABLEMEDIA' === parts[0]) {
            devices[i].removable = parts[1] === 'Removable';
          }
          if ('PARTITIONTYPE' === parts[0]) {
            devices[i].type = 'part';
          }
          if ('DEVICE/MEDIANAME' === parts[0]) {
            devices[i].model = parts[1];
          }
        }
      }
    }
  });
  return devices;
}

function parseBlk(lines) {
  let data = [];

  lines
    .filter((line) => line !== '')
    .forEach((line) => {
      try {
        line = decodeURIComponent(line.replace(/\\x/g, '%'));
        line = line.replace(/\\/g, '\\\\');
        const disk = JSON.parse(line);
        data.push({
          name: util.sanitizeShellString(disk.name),
          type: disk.type,
          fsType: disk.fsType,
          mount: disk.mountpoint,
          size: parseInt(disk.size, 10),
          physical: disk.type === 'disk' ? (disk.rota === '0' ? 'SSD' : 'HDD') : disk.type === 'rom' ? 'CD/DVD' : '',
          uuid: disk.uuid,
          label: disk.label,
          model: (disk.model || '').trim(),
          serial: disk.serial,
          removable: disk.rm === '1',
          protocol: disk.tran,
          group: disk.group || ''
        });
      } catch {
        util.noop();
      }
    });
  data = util.unique(data);
  data = util.sortByKey(data, ['type', 'name']);
  return data;
}

function decodeMdabmData(lines) {
  const raid = util.getValue(lines, 'md_level', '=');
  const label = util.getValue(lines, 'md_name', '='); // <- get label info
  const uuid = util.getValue(lines, 'md_uuid', '='); // <- get uuid info
  const members = [];
  lines.forEach((line) => {
    if (line.toLowerCase().startsWith('md_device_dev') && line.toLowerCase().indexOf('/dev/') > 0) {
      members.push(line.split('/dev/')[1]);
    }
  });
  return {
    raid,
    label,
    uuid,
    members
  };
}

function raidMatchLinux(data) {
  // for all block devices of type "raid%"
  let result = data;
  try {
    data.forEach((element) => {
      if (element.type.startsWith('raid')) {
        const lines = execSync(`mdadm --export --detail /dev/${element.name}`, util.execOptsLinux).toString().split('\n');
        const mdData = decodeMdabmData(lines);

        element.label = mdData.label; // <- assign label info
        element.uuid = mdData.uuid; // <- assign uuid info

        if (mdData && mdData.members && mdData.members.length && mdData.raid === element.type) {
          result = result.map((blockdevice) => {
            if (blockdevice.fsType === 'linux_raid_member' && mdData.members.indexOf(blockdevice.name) >= 0) {
              blockdevice.group = element.name;
            }
            return blockdevice;
          });
        }
      }
    });
  } catch {
    util.noop();
  }
  return result;
}

function getDevicesLinux(data) {
  const result = [];
  data.forEach((element) => {
    if (element.type.startsWith('disk')) {
      result.push(element.name);
    }
  });
  return result;
}

function matchDevicesLinux(data) {
  let result = data;
  try {
    const devices = getDevicesLinux(data);
    result = result.map((blockdevice) => {
      if (blockdevice.type.startsWith('part') || blockdevice.type.startsWith('disk')) {
        devices.forEach((element) => {
          if (blockdevice.name.startsWith(element)) {
            blockdevice.device = '/dev/' + element;
          }
        });
      }
      return blockdevice;
    });
  } catch {
    util.noop();
  }
  return result;
}

function getDevicesMac(data) {
  const result = [];
  data.forEach((element) => {
    if (element.type.startsWith('disk')) {
      result.push({ name: element.name, model: element.model, device: element.name });
    }
    if (element.type.startsWith('virtual')) {
      let device = '';
      result.forEach((e) => {
        if (e.model === element.model) {
          device = e.device;
        }
      });
      if (device) {
        result.push({ name: element.name, model: element.model, device });
      }
    }
  });
  return result;
}

function matchDevicesMac(data) {
  let result = data;
  try {
    const devices = getDevicesMac(data);
    result = result.map((blockdevice) => {
      if (blockdevice.type.startsWith('part') || blockdevice.type.startsWith('disk') || blockdevice.type.startsWith('virtual')) {
        devices.forEach((element) => {
          if (blockdevice.name.startsWith(element.name)) {
            blockdevice.device = element.device;
          }
        });
      }
      return blockdevice;
    });
  } catch {
    util.noop();
  }
  return result;
}

function getDevicesWin(diskDrives) {
  const result = [];
  diskDrives.forEach((element) => {
    const lines = element.split('\r\n');
    const device = util.getValue(lines, 'DeviceID', ':');
    let partitions = element.split('@{DeviceID=');
    if (partitions.length > 1) {
      partitions = partitions.slice(1);
      partitions.forEach((partition) => {
        result.push({ name: partition.split(';')[0].toUpperCase(), device });
      });
    }
  });
  return result;
}

function matchDevicesWin(data, diskDrives) {
  const devices = getDevicesWin(diskDrives);
  data.map((element) => {
    const filteresDevices = devices.filter((e) => {
      return e.name === element.name.toUpperCase();
    });
    if (filteresDevices.length > 0) {
      element.device = filteresDevices[0].device;
    }
    return element;
  });
  return data;
}

function blkStdoutToObject(stdout) {
  return stdout
    .toString()
    .replace(/NAME=/g, '{"name":')
    .replace(/FSTYPE=/g, ',"fsType":')
    .replace(/TYPE=/g, ',"type":')
    .replace(/SIZE=/g, ',"size":')
    .replace(/MOUNTPOINT=/g, ',"mountpoint":')
    .replace(/UUID=/g, ',"uuid":')
    .replace(/ROTA=/g, ',"rota":')
    .replace(/RO=/g, ',"ro":')
    .replace(/RM=/g, ',"rm":')
    .replace(/TRAN=/g, ',"tran":')
    .replace(/SERIAL=/g, ',"serial":')
    .replace(/LABEL=/g, ',"label":')
    .replace(/MODEL=/g, ',"model":')
    .replace(/OWNER=/g, ',"owner":')
    .replace(/GROUP=/g, ',"group":')
    .replace(/\n/g, '}\n');
}

function blockDevices(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let data = [];
      if (_linux) {
        // see https://wiki.ubuntuusers.de/lsblk/
        // exec("lsblk -bo NAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID,ROTA,RO,TRAN,SERIAL,LABEL,MODEL,OWNER,GROUP,MODE,ALIGNMENT,MIN-IO,OPT-IO,PHY-SEC,LOG-SEC,SCHED,RQ-SIZE,RA,WSAME", function (error, stdout) {
        const procLsblk1 = exec('lsblk -bPo NAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID,ROTA,RO,RM,TRAN,SERIAL,LABEL,MODEL,OWNER 2>/dev/null', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (!error) {
            const lines = blkStdoutToObject(stdout).split('\n');
            data = parseBlk(lines);
            data = raidMatchLinux(data);
            data = matchDevicesLinux(data);
            if (callback) {
              callback(data);
            }
            resolve(data);
          } else {
            const procLsblk2 = exec('lsblk -bPo NAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID,ROTA,RO,RM,LABEL,MODEL,OWNER 2>/dev/null', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
              if (!error) {
                const lines = blkStdoutToObject(stdout).split('\n');
                data = parseBlk(lines);
                data = raidMatchLinux(data);
              }
              if (callback) {
                callback(data);
              }
              resolve(data);
            });
            procLsblk2.on('error', () => {
              if (callback) {
                callback(data);
              }
              resolve(data);
            });
          }
        });
        procLsblk1.on('error', () => {
          if (callback) {
            callback(data);
          }
          resolve(data);
        });
      }
      if (_darwin) {
        const procDskutil = exec('diskutil info -all', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (!error) {
            const lines = stdout.toString().split('\n');
            // parse lines into temp array of devices
            data = parseDevices(lines);
            data = matchDevicesMac(data);
          }
          if (callback) {
            callback(data);
          }
          resolve(data);
        });
        procDskutil.on('error', () => {
          if (callback) {
            callback(data);
          }
          resolve(data);
        });
      }
      if (_sunos) {
        if (callback) {
          callback(data);
        }
        resolve(data);
      }
      if (_windows) {
        const drivetypes = ['Unknown', 'NoRoot', 'Removable', 'Local', 'Network', 'CD/DVD', 'RAM'];
        try {
          const workload = [];
          workload.push(util.powerShell('Get-CimInstance -ClassName Win32_LogicalDisk | select Caption,DriveType,Name,FileSystem,Size,VolumeSerialNumber,VolumeName | fl'));
          workload.push(
            util.powerShell(
              "Get-WmiObject -Class Win32_diskdrive | Select-Object -Property PNPDeviceId,DeviceID, Model, Size, @{L='Partitions'; E={$_.GetRelated('Win32_DiskPartition').GetRelated('Win32_LogicalDisk') | Select-Object -Property DeviceID, VolumeName, Size, FreeSpace}} | fl"
            )
          );
          util.promiseAll(workload).then((res) => {
            const logicalDisks = res.results[0].toString().split(/\n\s*\n/);
            const diskDrives = res.results[1].toString().split(/\n\s*\n/);
            logicalDisks.forEach((device) => {
              const lines = device.split('\r\n');
              const drivetype = util.getValue(lines, 'drivetype', ':');
              if (drivetype) {
                data.push({
                  name: util.getValue(lines, 'name', ':'),
                  identifier: util.getValue(lines, 'caption', ':'),
                  type: 'disk',
                  fsType: util.getValue(lines, 'filesystem', ':').toLowerCase(),
                  mount: util.getValue(lines, 'caption', ':'),
                  size: util.getValue(lines, 'size', ':'),
                  physical: drivetype >= 0 && drivetype <= 6 ? drivetypes[drivetype] : drivetypes[0],
                  uuid: util.getValue(lines, 'volumeserialnumber', ':'),
                  label: util.getValue(lines, 'volumename', ':'),
                  model: '',
                  serial: util.getValue(lines, 'volumeserialnumber', ':'),
                  removable: drivetype === '2',
                  protocol: '',
                  group: '',
                  device: ''
                });
              }
            });
            // match devices
            data = matchDevicesWin(data, diskDrives);
            if (callback) {
              callback(data);
            }
            resolve(data);
          });
        } catch {
          if (callback) {
            callback(data);
          }
          resolve(data);
        }
      }
      if (_freebsd || _openbsd || _netbsd) {
        // will follow
        if (callback) {
          callback(null);
        }
        resolve(null);
      }
    });
  });
}

exports.blockDevices = blockDevices;

// --------------------------
// FS - speed

function calcFsSpeed(rx, wx) {
  const result = {
    rx: 0,
    wx: 0,
    tx: 0,
    rx_sec: null,
    wx_sec: null,
    tx_sec: null,
    ms: 0
  };

  if (_fs_speed && _fs_speed.ms) {
    result.rx = rx;
    result.wx = wx;
    result.tx = result.rx + result.wx;
    result.ms = Date.now() - _fs_speed.ms;
    result.rx_sec = (result.rx - _fs_speed.bytes_read) / (result.ms / 1000);
    result.wx_sec = (result.wx - _fs_speed.bytes_write) / (result.ms / 1000);
    result.tx_sec = result.rx_sec + result.wx_sec;
    _fs_speed.rx_sec = result.rx_sec;
    _fs_speed.wx_sec = result.wx_sec;
    _fs_speed.tx_sec = result.tx_sec;
    _fs_speed.bytes_read = result.rx;
    _fs_speed.bytes_write = result.wx;
    _fs_speed.bytes_overall = result.rx + result.wx;
    _fs_speed.ms = Date.now();
    _fs_speed.last_ms = result.ms;
  } else {
    result.rx = rx;
    result.wx = wx;
    result.tx = result.rx + result.wx;
    _fs_speed.rx_sec = null;
    _fs_speed.wx_sec = null;
    _fs_speed.tx_sec = null;
    _fs_speed.bytes_read = result.rx;
    _fs_speed.bytes_write = result.wx;
    _fs_speed.bytes_overall = result.rx + result.wx;
    _fs_speed.ms = Date.now();
    _fs_speed.last_ms = 0;
  }
  return result;
}

function fsStats(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      if (_windows || _freebsd || _openbsd || _netbsd || _sunos) {
        return resolve(null);
      }

      let result = {
        rx: 0,
        wx: 0,
        tx: 0,
        rx_sec: null,
        wx_sec: null,
        tx_sec: null,
        ms: 0
      };

      let rx = 0;
      let wx = 0;
      if ((_fs_speed && !_fs_speed.ms) || (_fs_speed && _fs_speed.ms && Date.now() - _fs_speed.ms >= 500)) {
        if (_linux) {
          // exec("df -k | grep /dev/", function(error, stdout) {
          const procLsblk = exec('lsblk -r 2>/dev/null | grep /', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
            if (!error) {
              const lines = stdout.toString().split('\n');
              const fs_filter = [];
              lines.forEach((line) => {
                if (line !== '') {
                  line = line.trim().split(' ');
                  if (fs_filter.indexOf(line[0]) === -1) {
                    fs_filter.push(line[0]);
                  }
                }
              });

              const output = fs_filter.join('|');
              const procCat = exec('cat /proc/diskstats | egrep "' + output + '"', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
                if (!error) {
                  const lines = stdout.toString().split('\n');
                  lines.forEach((line) => {
                    line = line.trim();
                    if (line !== '') {
                      line = line.replace(/ +/g, ' ').split(' ');

                      rx += parseInt(line[5], 10) * 512;
                      wx += parseInt(line[9], 10) * 512;
                    }
                  });
                  result = calcFsSpeed(rx, wx);
                }
                if (callback) {
                  callback(result);
                }
                resolve(result);
              });
              procCat.on('error', () => {
                if (callback) {
                  callback(result);
                }
                resolve(result);
              });
            } else {
              if (callback) {
                callback(result);
              }
              resolve(result);
            }
          });
          procLsblk.on('error', () => {
            if (callback) {
              callback(result);
            }
            resolve(result);
          });
        }
        if (_darwin) {
          const procIoreg = exec(
            'ioreg -c IOBlockStorageDriver -k Statistics -r -w0 | sed -n "/IOBlockStorageDriver/,/Statistics/p" | grep "Statistics" | tr -cd "01234567890,\n"',
            { maxBuffer: 1024 * 1024 },
            (error, stdout) => {
              if (!error) {
                const lines = stdout.toString().split('\n');
                lines.forEach((line) => {
                  line = line.trim();
                  if (line !== '') {
                    line = line.split(',');

                    rx += parseInt(line[2], 10);
                    wx += parseInt(line[9], 10);
                  }
                });
                result = calcFsSpeed(rx, wx);
              }
              if (callback) {
                callback(result);
              }
              resolve(result);
            }
          );
          procIoreg.on('error', () => {
            if (callback) {
              callback(result);
            }
            resolve(result);
          });
        }
      } else {
        result.ms = _fs_speed.last_ms;
        result.rx = _fs_speed.bytes_read;
        result.wx = _fs_speed.bytes_write;
        result.tx = _fs_speed.bytes_read + _fs_speed.bytes_write;
        result.rx_sec = _fs_speed.rx_sec;
        result.wx_sec = _fs_speed.wx_sec;
        result.tx_sec = _fs_speed.tx_sec;
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
    });
  });
}

exports.fsStats = fsStats;

function calcDiskIO(rIO, wIO, rWaitTime, wWaitTime, tWaitTime) {
  const result = {
    rIO: 0,
    wIO: 0,
    tIO: 0,
    rIO_sec: null,
    wIO_sec: null,
    tIO_sec: null,
    rWaitTime: 0,
    wWaitTime: 0,
    tWaitTime: 0,
    rWaitPercent: null,
    wWaitPercent: null,
    tWaitPercent: null,
    ms: 0
  };
  if (_disk_io && _disk_io.ms) {
    result.rIO = rIO;
    result.wIO = wIO;
    result.tIO = rIO + wIO;
    result.ms = Date.now() - _disk_io.ms;
    result.rIO_sec = (result.rIO - _disk_io.rIO) / (result.ms / 1000);
    result.wIO_sec = (result.wIO - _disk_io.wIO) / (result.ms / 1000);
    result.tIO_sec = result.rIO_sec + result.wIO_sec;
    result.rWaitTime = rWaitTime;
    result.wWaitTime = wWaitTime;
    result.tWaitTime = tWaitTime;
    result.rWaitPercent = ((result.rWaitTime - _disk_io.rWaitTime) * 100) / result.ms;
    result.wWaitPercent = ((result.wWaitTime - _disk_io.wWaitTime) * 100) / result.ms;
    result.tWaitPercent = ((result.tWaitTime - _disk_io.tWaitTime) * 100) / result.ms;
    _disk_io.rIO = rIO;
    _disk_io.wIO = wIO;
    _disk_io.rIO_sec = result.rIO_sec;
    _disk_io.wIO_sec = result.wIO_sec;
    _disk_io.tIO_sec = result.tIO_sec;
    _disk_io.rWaitTime = rWaitTime;
    _disk_io.wWaitTime = wWaitTime;
    _disk_io.tWaitTime = tWaitTime;
    _disk_io.rWaitPercent = result.rWaitPercent;
    _disk_io.wWaitPercent = result.wWaitPercent;
    _disk_io.tWaitPercent = result.tWaitPercent;
    _disk_io.last_ms = result.ms;
    _disk_io.ms = Date.now();
  } else {
    result.rIO = rIO;
    result.wIO = wIO;
    result.tIO = rIO + wIO;
    result.rWaitTime = rWaitTime;
    result.wWaitTime = wWaitTime;
    result.tWaitTime = tWaitTime;
    _disk_io.rIO = rIO;
    _disk_io.wIO = wIO;
    _disk_io.rIO_sec = null;
    _disk_io.wIO_sec = null;
    _disk_io.tIO_sec = null;
    _disk_io.rWaitTime = rWaitTime;
    _disk_io.wWaitTime = wWaitTime;
    _disk_io.tWaitTime = tWaitTime;
    _disk_io.rWaitPercent = null;
    _disk_io.wWaitPercent = null;
    _disk_io.tWaitPercent = null;
    _disk_io.last_ms = 0;
    _disk_io.ms = Date.now();
  }
  return result;
}

function disksIO(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      if (_windows) {
        return resolve(null);
      }
      if (_sunos) {
        return resolve(null);
      }

      let result = {
        rIO: 0,
        wIO: 0,
        tIO: 0,
        rIO_sec: null,
        wIO_sec: null,
        tIO_sec: null,
        rWaitTime: 0,
        wWaitTime: 0,
        tWaitTime: 0,
        rWaitPercent: null,
        wWaitPercent: null,
        tWaitPercent: null,
        ms: 0
      };
      let rIO = 0;
      let wIO = 0;
      let rWaitTime = 0;
      let wWaitTime = 0;
      let tWaitTime = 0;

      if ((_disk_io && !_disk_io.ms) || (_disk_io && _disk_io.ms && Date.now() - _disk_io.ms >= 500)) {
        if (_linux || _freebsd || _openbsd || _netbsd) {
          // prints Block layer statistics for all mounted volumes
          // var cmd = "for mount in `lsblk | grep / | sed -r 's/│ └─//' | cut -d ' ' -f 1`; do cat /sys/block/$mount/stat | sed -r 's/ +/;/g' | sed -r 's/^;//'; done";
          // var cmd = "for mount in `lsblk | grep / | sed 's/[│└─├]//g' | awk '{$1=$1};1' | cut -d ' ' -f 1 | sort -u`; do cat /sys/block/$mount/stat | sed -r 's/ +/;/g' | sed -r 's/^;//'; done";
          const cmd =
            'for mount in `lsblk 2>/dev/null | grep " disk " | sed "s/[│└─├]//g" | awk \'{$1=$1};1\' | cut -d " " -f 1 | sort -u`; do cat /sys/block/$mount/stat | sed -r "s/ +/;/g" | sed -r "s/^;//"; done';

          exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
            if (!error) {
              const lines = stdout.split('\n');
              lines.forEach((line) => {
                // ignore empty lines
                if (!line) {
                  return;
                }

                // sum r/wIO of all disks to compute all disks IO
                const stats = line.split(';');
                rIO += parseInt(stats[0], 10);
                wIO += parseInt(stats[4], 10);
                rWaitTime += parseInt(stats[3], 10);
                wWaitTime += parseInt(stats[7], 10);
                tWaitTime += parseInt(stats[10], 10);
              });
              result = calcDiskIO(rIO, wIO, rWaitTime, wWaitTime, tWaitTime);

              if (callback) {
                callback(result);
              }
              resolve(result);
            } else {
              if (callback) {
                callback(result);
              }
              resolve(result);
            }
          });
        }
        if (_darwin) {
          exec(
            'ioreg -c IOBlockStorageDriver -k Statistics -r -w0 | sed -n "/IOBlockStorageDriver/,/Statistics/p" | grep "Statistics" | tr -cd "01234567890,\n"',
            { maxBuffer: 1024 * 1024 },
            (error, stdout) => {
              if (!error) {
                const lines = stdout.toString().split('\n');
                lines.forEach((line) => {
                  line = line.trim();
                  if (line !== '') {
                    line = line.split(',');

                    rIO += parseInt(line[10], 10);
                    wIO += parseInt(line[0], 10);
                  }
                });
                result = calcDiskIO(rIO, wIO, rWaitTime, wWaitTime, tWaitTime);
              }
              if (callback) {
                callback(result);
              }
              resolve(result);
            }
          );
        }
      } else {
        result.rIO = _disk_io.rIO;
        result.wIO = _disk_io.wIO;
        result.tIO = _disk_io.rIO + _disk_io.wIO;
        result.ms = _disk_io.last_ms;
        result.rIO_sec = _disk_io.rIO_sec;
        result.wIO_sec = _disk_io.wIO_sec;
        result.tIO_sec = _disk_io.tIO_sec;
        result.rWaitTime = _disk_io.rWaitTime;
        result.wWaitTime = _disk_io.wWaitTime;
        result.tWaitTime = _disk_io.tWaitTime;
        result.rWaitPercent = _disk_io.rWaitPercent;
        result.wWaitPercent = _disk_io.wWaitPercent;
        result.tWaitPercent = _disk_io.tWaitPercent;
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
    });
  });
}

exports.disksIO = disksIO;

function diskLayout(callback) {
  function getVendorFromModel(model) {
    const diskManufacturers = [
      { pattern: 'WESTERN.*', manufacturer: 'Western Digital' },
      { pattern: '^WDC.*', manufacturer: 'Western Digital' },
      { pattern: 'WD.*', manufacturer: 'Western Digital' },
      { pattern: 'TOSHIBA.*', manufacturer: 'Toshiba' },
      { pattern: 'HITACHI.*', manufacturer: 'Hitachi' },
      { pattern: '^IC.*', manufacturer: 'Hitachi' },
      { pattern: '^HTS.*', manufacturer: 'Hitachi' },
      { pattern: 'SANDISK.*', manufacturer: 'SanDisk' },
      { pattern: 'KINGSTON.*', manufacturer: 'Kingston Technology' },
      { pattern: '^SONY.*', manufacturer: 'Sony' },
      { pattern: 'TRANSCEND.*', manufacturer: 'Transcend' },
      { pattern: 'SAMSUNG.*', manufacturer: 'Samsung' },
      { pattern: '^ST(?!I\\ ).*', manufacturer: 'Seagate' },
      { pattern: '^STI\\ .*', manufacturer: 'SimpleTech' },
      { pattern: '^D...-.*', manufacturer: 'IBM' },
      { pattern: '^IBM.*', manufacturer: 'IBM' },
      { pattern: '^FUJITSU.*', manufacturer: 'Fujitsu' },
      { pattern: '^MP.*', manufacturer: 'Fujitsu' },
      { pattern: '^MK.*', manufacturer: 'Toshiba' },
      { pattern: 'MAXTO.*', manufacturer: 'Maxtor' },
      { pattern: 'PIONEER.*', manufacturer: 'Pioneer' },
      { pattern: 'PHILIPS.*', manufacturer: 'Philips' },
      { pattern: 'QUANTUM.*', manufacturer: 'Quantum Technology' },
      { pattern: 'FIREBALL.*', manufacturer: 'Quantum Technology' },
      { pattern: '^VBOX.*', manufacturer: 'VirtualBox' },
      { pattern: 'CORSAIR.*', manufacturer: 'Corsair Components' },
      { pattern: 'CRUCIAL.*', manufacturer: 'Crucial' },
      { pattern: 'ECM.*', manufacturer: 'ECM' },
      { pattern: 'INTEL.*', manufacturer: 'INTEL' },
      { pattern: 'EVO.*', manufacturer: 'Samsung' },
      { pattern: 'APPLE.*', manufacturer: 'Apple' }
    ];

    let result = '';
    if (model) {
      model = model.toUpperCase();
      diskManufacturers.forEach((manufacturer) => {
        const re = RegExp(manufacturer.pattern);
        if (re.test(model)) {
          result = manufacturer.manufacturer;
        }
      });
    }
    return result;
  }

  return new Promise((resolve) => {
    process.nextTick(() => {
      const commitResult = (res) => {
        for (let i = 0; i < res.length; i++) {
          delete res[i].BSDName;
        }
        if (callback) {
          callback(res);
        }
        resolve(res);
      };

      const result = [];
      let cmd = '';

      if (_linux) {
        let cmdFullSmart = '';

        exec('export LC_ALL=C; lsblk -ablJO 2>/dev/null; unset LC_ALL', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (!error) {
            try {
              const out = stdout.toString().trim();
              let devices = [];
              try {
                const outJSON = JSON.parse(out);
                if (outJSON && {}.hasOwnProperty.call(outJSON, 'blockdevices')) {
                  devices = outJSON.blockdevices.filter((item) => {
                    return (
                      item.type === 'disk' &&
                      item.size > 0 &&
                      (item.model !== null ||
                        (item.mountpoint === null &&
                          item.label === null &&
                          item.fstype === null &&
                          item.parttype === null &&
                          item.path &&
                          item.path.indexOf('/ram') !== 0 &&
                          item.path.indexOf('/loop') !== 0 &&
                          item['disc-max'] &&
                          item['disc-max'] !== 0))
                    );
                  });
                }
              } catch {
                // fallback to older version of lsblk
                try {
                  const out2 = execSync(
                    'export LC_ALL=C; lsblk -bPo NAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID,ROTA,RO,RM,LABEL,MODEL,OWNER,GROUP 2>/dev/null; unset LC_ALL',
                    util.execOptsLinux
                  ).toString();
                  const lines = blkStdoutToObject(out2).split('\n');
                  const data = parseBlk(lines);
                  devices = data.filter((item) => {
                    return item.type === 'disk' && item.size > 0 && ((item.model !== null && item.model !== '') || (item.mount === '' && item.label === '' && item.fsType === ''));
                  });
                } catch {
                  util.noop();
                }
              }
              devices.forEach((device) => {
                let mediumType = '';
                const BSDName = '/dev/' + device.name;
                const logical = device.name;
                try {
                  mediumType = execSync('cat /sys/block/' + logical + '/queue/rotational 2>/dev/null', util.execOptsLinux)
                    .toString()
                    .split('\n')[0];
                } catch {
                  util.noop();
                }
                let interfaceType = device.tran ? device.tran.toUpperCase().trim() : '';
                if (interfaceType === 'NVME') {
                  mediumType = '2';
                  interfaceType = 'PCIe';
                }
                result.push({
                  device: BSDName,
                  type:
                    mediumType === '0'
                      ? 'SSD'
                      : mediumType === '1'
                        ? 'HD'
                        : mediumType === '2'
                          ? 'NVMe'
                          : device.model && device.model.indexOf('SSD') > -1
                            ? 'SSD'
                            : device.model && device.model.indexOf('NVM') > -1
                              ? 'NVMe'
                              : 'HD',
                  name: device.model || '',
                  vendor: getVendorFromModel(device.model) || (device.vendor ? device.vendor.trim() : ''),
                  size: device.size || 0,
                  bytesPerSector: null,
                  totalCylinders: null,
                  totalHeads: null,
                  totalSectors: null,
                  totalTracks: null,
                  tracksPerCylinder: null,
                  sectorsPerTrack: null,
                  firmwareRevision: device.rev ? device.rev.trim() : '',
                  serialNum: device.serial ? device.serial.trim() : '',
                  interfaceType: interfaceType,
                  smartStatus: 'unknown',
                  temperature: null,
                  BSDName: BSDName
                });
                cmd += `printf "\n${BSDName}|"; smartctl -H ${BSDName} | grep overall;`;
                cmdFullSmart += `${cmdFullSmart ? 'printf ",";' : ''}smartctl -a -j ${BSDName};`;
              });
            } catch {
              util.noop();
            }
          }
          // check S.M.A.R.T. status
          if (cmdFullSmart) {
            exec(cmdFullSmart, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
              try {
                const data = JSON.parse(`[${stdout}]`);
                data.forEach((disk) => {
                  const diskBSDName = disk.smartctl.argv[disk.smartctl.argv.length - 1];

                  for (let i = 0; i < result.length; i++) {
                    if (result[i].BSDName === diskBSDName) {
                      result[i].smartStatus = disk.smart_status.passed ? 'Ok' : disk.smart_status.passed === false ? 'Predicted Failure' : 'unknown';
                      if (disk.temperature && disk.temperature.current) {
                        result[i].temperature = disk.temperature.current;
                      }
                      result[i].smartData = disk;
                    }
                  }
                });
                commitResult(result);
              } catch {
                if (cmd) {
                  cmd = cmd + 'printf "\n"';
                  exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
                    const lines = stdout.toString().split('\n');
                    lines.forEach((line) => {
                      if (line) {
                        const parts = line.split('|');
                        if (parts.length === 2) {
                          const BSDName = parts[0];
                          parts[1] = parts[1].trim();
                          const parts2 = parts[1].split(':');
                          if (parts2.length === 2) {
                            parts2[1] = parts2[1].trim();
                            const status = parts2[1].toLowerCase();
                            for (let i = 0; i < result.length; i++) {
                              if (result[i].BSDName === BSDName) {
                                result[i].smartStatus = status === 'passed' ? 'Ok' : status === 'failed!' ? 'Predicted Failure' : 'unknown';
                              }
                            }
                          }
                        }
                      }
                    });
                    commitResult(result);
                  });
                } else {
                  commitResult(result);
                }
              }
            });
          } else {
            commitResult(result);
          }
        });
      }
      if (_freebsd || _openbsd || _netbsd) {
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
      if (_sunos) {
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
      if (_darwin) {
        exec('system_profiler SPSerialATADataType SPNVMeDataType SPUSBDataType', { maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (!error) {
            // split by type:
            const lines = stdout.toString().split('\n');
            const linesSATA = [];
            const linesNVMe = [];
            const linesUSB = [];
            let dataType = 'SATA';
            lines.forEach((line) => {
              if (line === 'NVMExpress:') {
                dataType = 'NVMe';
              } else if (line === 'USB:') {
                dataType = 'USB';
              } else if (line === 'SATA/SATA Express:') {
                dataType = 'SATA';
              } else if (dataType === 'SATA') {
                linesSATA.push(line);
              } else if (dataType === 'NVMe') {
                linesNVMe.push(line);
              } else if (dataType === 'USB') {
                linesUSB.push(line);
              }
            });
            try {
              // Serial ATA Drives
              const devices = linesSATA.join('\n').split(' Physical Interconnect: ');
              devices.shift();
              devices.forEach((device) => {
                device = 'InterfaceType: ' + device;
                const lines = device.split('\n');
                const mediumType = util.getValue(lines, 'Medium Type', ':', true).trim();
                const sizeStr = util.getValue(lines, 'capacity', ':', true).trim();
                const BSDName = util.getValue(lines, 'BSD Name', ':', true).trim();
                if (sizeStr) {
                  let sizeValue = 0;
                  if (sizeStr.indexOf('(') >= 0) {
                    sizeValue = parseInt(
                      sizeStr
                        .match(/\(([^)]+)\)/)[1]
                        .replace(/\./g, '')
                        .replace(/,/g, '')
                        .replace(/\s/g, ''),
                      10
                    );
                  }
                  if (!sizeValue) {
                    sizeValue = parseInt(sizeStr, 10);
                  }
                  if (sizeValue) {
                    const smartStatusString = util.getValue(lines, 'S.M.A.R.T. status', ':', true).trim().toLowerCase();
                    result.push({
                      device: BSDName,
                      type: mediumType.startsWith('Solid') ? 'SSD' : 'HD',
                      name: util.getValue(lines, 'Model', ':', true).trim(),
                      vendor: getVendorFromModel(util.getValue(lines, 'Model', ':', true).trim()) || util.getValue(lines, 'Manufacturer', ':', true),
                      size: sizeValue,
                      bytesPerSector: null,
                      totalCylinders: null,
                      totalHeads: null,
                      totalSectors: null,
                      totalTracks: null,
                      tracksPerCylinder: null,
                      sectorsPerTrack: null,
                      firmwareRevision: util.getValue(lines, 'Revision', ':', true).trim(),
                      serialNum: util.getValue(lines, 'Serial Number', ':', true).trim(),
                      interfaceType: util.getValue(lines, 'InterfaceType', ':', true).trim(),
                      smartStatus: smartStatusString === 'verified' ? 'OK' : smartStatusString || 'unknown',
                      temperature: null,
                      BSDName: BSDName
                    });
                    cmd = cmd + 'printf "\n' + BSDName + '|"; diskutil info /dev/' + BSDName + ' | grep SMART;';
                  }
                }
              });
            } catch {
              util.noop();
            }

            // NVME Drives
            try {
              const devices = linesNVMe.join('\n').split('\n\n          Capacity:');
              devices.shift();
              devices.forEach((device) => {
                device = `!Capacity: ${device}`;
                const lines = device.split('\n');
                const linkWidth = util.getValue(lines, 'link width', ':', true).trim();
                const sizeStr = util.getValue(lines, '!capacity', ':', true).trim();
                const BSDName = util.getValue(lines, 'BSD Name', ':', true).trim();
                if (sizeStr) {
                  let sizeValue = 0;
                  if (sizeStr.indexOf('(') >= 0) {
                    sizeValue = parseInt(
                      sizeStr
                        .match(/\(([^)]+)\)/)[1]
                        .replace(/\./g, '')
                        .replace(/,/g, '')
                        .replace(/\s/g, ''),
                      10
                    );
                  }
                  if (!sizeValue) {
                    sizeValue = parseInt(sizeStr, 10);
                  }
                  if (sizeValue) {
                    const smartStatusString = util.getValue(lines, 'S.M.A.R.T. status', ':', true).trim().toLowerCase();
                    result.push({
                      device: BSDName,
                      type: 'NVMe',
                      name: util.getValue(lines, 'Model', ':', true).trim(),
                      vendor: getVendorFromModel(util.getValue(lines, 'Model', ':', true).trim()),
                      size: sizeValue,
                      bytesPerSector: null,
                      totalCylinders: null,
                      totalHeads: null,
                      totalSectors: null,
                      totalTracks: null,
                      tracksPerCylinder: null,
                      sectorsPerTrack: null,
                      firmwareRevision: util.getValue(lines, 'Revision', ':', true).trim(),
                      serialNum: util.getValue(lines, 'Serial Number', ':', true).trim(),
                      interfaceType: ('PCIe ' + linkWidth).trim(),
                      smartStatus: smartStatusString === 'verified' ? 'OK' : smartStatusString || 'unknown',
                      temperature: null,
                      BSDName: BSDName
                    });
                    cmd = `${cmd}printf "\n${BSDName}|"; diskutil info /dev/${BSDName} | grep SMART;`;
                  }
                }
              });
            } catch {
              util.noop();
            }
            // USB Drives
            try {
              const devices = linesUSB.join('\n').replaceAll('Media:\n ', 'Model:').split('\n\n          Product ID:');
              devices.shift();
              devices.forEach((device) => {
                const lines = device.split('\n');
                const sizeStr = util.getValue(lines, 'Capacity', ':', true).trim();
                const BSDName = util.getValue(lines, 'BSD Name', ':', true).trim();
                if (sizeStr) {
                  let sizeValue = 0;
                  if (sizeStr.indexOf('(') >= 0) {
                    sizeValue = parseInt(
                      sizeStr
                        .match(/\(([^)]+)\)/)[1]
                        .replace(/\./g, '')
                        .replace(/,/g, '')
                        .replace(/\s/g, ''),
                      10
                    );
                  }
                  if (!sizeValue) {
                    sizeValue = parseInt(sizeStr, 10);
                  }
                  if (sizeValue) {
                    const smartStatusString = util.getValue(lines, 'S.M.A.R.T. status', ':', true).trim().toLowerCase();
                    result.push({
                      device: BSDName,
                      type: 'USB',
                      name: util.getValue(lines, 'Model', ':', true).trim().replaceAll(':', ''),
                      vendor: getVendorFromModel(util.getValue(lines, 'Model', ':', true).trim()),
                      size: sizeValue,
                      bytesPerSector: null,
                      totalCylinders: null,
                      totalHeads: null,
                      totalSectors: null,
                      totalTracks: null,
                      tracksPerCylinder: null,
                      sectorsPerTrack: null,
                      firmwareRevision: util.getValue(lines, 'Revision', ':', true).trim(),
                      serialNum: util.getValue(lines, 'Serial Number', ':', true).trim(),
                      interfaceType: 'USB',
                      smartStatus: smartStatusString === 'verified' ? 'OK' : smartStatusString || 'unknown',
                      temperature: null,
                      BSDName: BSDName
                    });
                    cmd = cmd + 'printf "\n' + BSDName + '|"; diskutil info /dev/' + BSDName + ' | grep SMART;';
                  }
                }
              });
            } catch {
              util.noop();
            }
            if (cmd) {
              cmd = cmd + 'printf "\n"';
              exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
                const lines = stdout.toString().split('\n');
                lines.forEach((line) => {
                  if (line) {
                    const parts = line.split('|');
                    if (parts.length === 2) {
                      const BSDName = parts[0];
                      parts[1] = parts[1].trim();
                      const parts2 = parts[1].split(':');
                      if (parts2.length === 2) {
                        parts2[1] = parts2[1].trim();
                        const status = parts2[1].toLowerCase();
                        for (let i = 0; i < result.length; i++) {
                          if (result[i].BSDName === BSDName) {
                            result[i].smartStatus = status === 'not supported' ? 'not supported' : status === 'verified' ? 'Ok' : status === 'failing' ? 'Predicted Failure' : 'unknown';
                          }
                        }
                      }
                    }
                  }
                });
                commitResult(result);
              });
            } else {
              commitResult(result);
            }
          } else {
            commitResult(result);
          }
        });
      }
      if (_windows) {
        try {
          const workload = [];
          workload.push(
            util.powerShell(
              'Get-CimInstance Win32_DiskDrive | select Caption,Size,Status,PNPDeviceId,DeviceId,BytesPerSector,TotalCylinders,TotalHeads,TotalSectors,TotalTracks,TracksPerCylinder,SectorsPerTrack,FirmwareRevision,SerialNumber,InterfaceType | fl'
            )
          );
          workload.push(util.powerShell('Get-PhysicalDisk | select BusType,MediaType,FriendlyName,Model,SerialNumber,Size | fl'));
          if (util.smartMonToolsInstalled()) {
            try {
              const smartDev = JSON.parse(execSync('smartctl --scan -j').toString());
              if (smartDev && smartDev.devices && smartDev.devices.length > 0) {
                smartDev.devices.forEach((dev) => {
                  workload.push(execPromiseSave(`smartctl -j -a ${dev.name}`, util.execOptsWin));
                });
              }
            } catch {
              util.noop();
            }
          }
          util.promiseAll(workload).then((data) => {
            let devices = data.results[0].toString().split(/\n\s*\n/);
            devices.forEach((device) => {
              const lines = device.split('\r\n');
              const size = util.getValue(lines, 'Size', ':').trim();
              const status = util.getValue(lines, 'Status', ':').trim().toLowerCase();
              if (size) {
                result.push({
                  device: util.getValue(lines, 'DeviceId', ':'), // changed from PNPDeviceId to DeviceID (be be able to match devices)
                  type: device.indexOf('SSD') > -1 ? 'SSD' : 'HD', // just a starting point ... better: MSFT_PhysicalDisk - Media Type ... see below
                  name: util.getValue(lines, 'Caption', ':'),
                  vendor: getVendorFromModel(util.getValue(lines, 'Caption', ':', true).trim()),
                  size: parseInt(size, 10),
                  bytesPerSector: parseInt(util.getValue(lines, 'BytesPerSector', ':'), 10),
                  totalCylinders: parseInt(util.getValue(lines, 'TotalCylinders', ':'), 10),
                  totalHeads: parseInt(util.getValue(lines, 'TotalHeads', ':'), 10),
                  totalSectors: parseInt(util.getValue(lines, 'TotalSectors', ':'), 10),
                  totalTracks: parseInt(util.getValue(lines, 'TotalTracks', ':'), 10),
                  tracksPerCylinder: parseInt(util.getValue(lines, 'TracksPerCylinder', ':'), 10),
                  sectorsPerTrack: parseInt(util.getValue(lines, 'SectorsPerTrack', ':'), 10),
                  firmwareRevision: util.getValue(lines, 'FirmwareRevision', ':').trim(),
                  serialNum: util.getValue(lines, 'SerialNumber', ':').trim(),
                  interfaceType: util.getValue(lines, 'InterfaceType', ':').trim(),
                  smartStatus: status === 'ok' ? 'Ok' : status === 'degraded' ? 'Degraded' : status === 'pred fail' ? 'Predicted Failure' : 'Unknown',
                  temperature: null
                });
              }
            });
            devices = data.results[1].split(/\n\s*\n/);
            devices.forEach((device) => {
              const lines = device.split('\r\n');
              const serialNum = util.getValue(lines, 'SerialNumber', ':').trim();
              const name = util.getValue(lines, 'FriendlyName', ':').trim().replace('Msft ', 'Microsoft');
              const size = util.getValue(lines, 'Size', ':').trim();
              const model = util.getValue(lines, 'Model', ':').trim();
              const interfaceType = util.getValue(lines, 'BusType', ':').trim();
              let mediaType = util.getValue(lines, 'MediaType', ':').trim();
              if (mediaType === '3' || mediaType === 'HDD') {
                mediaType = 'HD';
              }
              if (mediaType === '4') {
                mediaType = 'SSD';
              }
              if (mediaType === '5') {
                mediaType = 'SCM';
              }
              if (mediaType === 'Unspecified' && (model.toLowerCase().indexOf('virtual') > -1 || model.toLowerCase().indexOf('vbox') > -1)) {
                mediaType = 'Virtual';
              }
              if (size) {
                let i = util.findObjectByKey(result, 'serialNum', serialNum);
                if (i === -1 || serialNum === '') {
                  i = util.findObjectByKey(result, 'name', name);
                }
                if (i !== -1) {
                  result[i].type = mediaType;
                  result[i].interfaceType = interfaceType;
                }
              }
            });
            // S.M.A.R.T
            data.results.shift();
            data.results.shift();
            if (data.results.length) {
              data.results.forEach((smartStr) => {
                try {
                  const smartData = JSON.parse(smartStr);
                  if (smartData.serial_number) {
                    const serialNum = smartData.serial_number;
                    const i = util.findObjectByKey(result, 'serialNum', serialNum);
                    if (i !== -1) {
                      result[i].smartStatus =
                        smartData.smart_status && smartData.smart_status.passed ? 'Ok' : smartData.smart_status && smartData.smart_status.passed === false ? 'Predicted Failure' : 'unknown';
                      if (smartData.temperature && smartData.temperature.current) {
                        result[i].temperature = smartData.temperature.current;
                      }
                      result[i].smartData = smartData;
                    }
                  }
                } catch {
                  util.noop();
                }
              });
            }
            if (callback) {
              callback(result);
            }
            resolve(result);
          });
        } catch {
          if (callback) {
            callback(result);
          }
          resolve(result);
        }
      }
    });
  });
}

exports.diskLayout = diskLayout;
