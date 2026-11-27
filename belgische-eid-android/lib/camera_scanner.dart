import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

class CameraScannerScreen extends StatefulWidget {
  const CameraScannerScreen({super.key});
  @override
  State<CameraScannerScreen> createState() => _CameraScannerScreenState();
}

class _CameraScannerScreenState extends State<CameraScannerScreen> {
  final _picker = ImagePicker();
  final _recognizer = TextRecognizer(script: TextRecognitionScript.latin);
  final Map<String, String> _fields = {};
  String _frontText = '';
  String _backText = '';
  String? _frontPath;
  String? _backPath;
  bool _busy = false;
  String? _status;
  String? _error;

  @override
  void dispose() {
    _recognizer.close();
    super.dispose();
  }

  Future<void> _capture(bool front) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _status = 'Camera openen…';
    });
    try {
      final image = await _picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.rear,
        imageQuality: 95,
      );
      if (image == null) {
        if (mounted) setState(() => _status = 'Scannen geannuleerd.');
        return;
      }
      final result = await _recognizer.processImage(InputImage.fromFilePath(image.path));
      if (result.text.trim().isEmpty) {
        throw Exception('Geen tekst herkend. Probeer meer licht en een scherpere foto.');
      }
      if (!mounted) return;
      setState(() {
        if (front) {
          _frontPath = image.path;
          _frontText = result.text.trim();
        } else {
          _backPath = image.path;
          _backText = result.text.trim();
        }
        _extractMrz();
        _status = front
            ? 'Voorkant herkend. Fotografeer nu de achterkant.'
            : 'Achterkant herkend. Controleer de resultaten.';
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Scannen mislukt: ' + e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _extractMrz() {
    final lines = _backText
        .split(RegExp(r'[\r\n]+'))
        .map((s) => s.toUpperCase().replaceAll(RegExp(r'\s+'), ''))
        .where((s) => s.isNotEmpty)
        .toList();
    String? l1, l2, l3;
    for (final raw in lines) {
      final s = raw.replaceFirst(RegExp(r'^I[<D]BEL'), 'I<BEL');
      if (s.startsWith('I<BEL') && s.length >= 12) l1 ??= s;
      if (RegExp(r'\d{6}[MF<]\d{6}BEL').hasMatch(s)) l2 ??= s;
      if (s.contains('<<') && s.length >= 10) l3 ??= s;
    }
    if (l1 != null) {
      final m = RegExp(r'^I<BEL([A-Z0-9<]{5,})').firstMatch(l1);
      if (m != null) {
        final raw = m.group(1)!;
        _fields['Kaartnummer (MRZ)'] =
            raw.substring(0, raw.length < 9 ? raw.length : 9).replaceAll('<', '');
      }
    }
    if (l2 != null) {
      final m = RegExp(r'(\d{6})([MF<])(\d{6})BEL').firstMatch(l2);
      if (m != null) {
        _fields['Geboortedatum (MRZ)'] = _date(m.group(1)!);
        _fields['Geslacht (MRZ)'] = m.group(2) == 'M'
            ? 'Man'
            : (m.group(2) == 'F' ? 'Vrouw' : 'Niet herkend');
        _fields['Geldig tot (MRZ)'] = _date(m.group(3)!);
        _fields['Nationaliteit (MRZ)'] = 'Belgisch (BEL)';
      }
    }
    if (l3 != null) {
      final parts = l3.split('<<');
      _fields['Familienaam (MRZ)'] = parts.first.replaceAll('<', ' ').trim();
      if (parts.length > 1) {
        _fields['Voornamen (MRZ)'] =
            parts.skip(1).join(' ').replaceAll('<', ' ').trim();
      }
    }
  }

  String _date(String s) {
    final yy = int.parse(s.substring(0, 2));
    final year = yy > DateTime.now().year % 100 ? 1900 + yy : 2000 + yy;
    return s.substring(4, 6) + '/' + s.substring(2, 4) + '/' + year.toString();
  }

  Map<String, dynamic> _data() => {
        'exportedAt': DateTime.now().toIso8601String(),
        'method': 'camera_ocr',
        'fields': _fields,
        'frontText': _frontText,
        'backText': _backText,
        'note': 'OCR kan fouten bevatten. Geen NFC-chip- of echtheidscontrole.',
      };

  Future<void> _exportJson() async {
    try {
      final dir = await getTemporaryDirectory();
      final file = File(dir.path + '/belgische_eid_camera.json');
      await file.writeAsString(const JsonEncoder.withIndent('  ').convert(_data()));
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/json')],
        text: 'OCR-scan van identiteitskaart. Bevat gevoelige persoonsgegevens.',
      );
    } catch (e) {
      _message('JSON-export mislukt: ' + e.toString());
    }
  }

  Future<void> _exportPdf() async {
    try {
      final pdf = pw.Document();
      pdf.addPage(pw.MultiPage(build: (_) => [
        pw.Header(level: 0, child: pw.Text('Belgische eID - camerascan')),
        ..._fields.entries.map((e) => pw.Padding(
          padding: const pw.EdgeInsets.symmetric(vertical: 4),
          child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.SizedBox(width: 150, child: pw.Text(e.key)),
            pw.Expanded(child: pw.Text(e.value)),
          ]),
        )),
        pw.SizedBox(height: 16),
        pw.Text('Herkende tekst - voorkant', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
        pw.Text(_frontText.isEmpty ? 'Niet gescand' : _frontText),
        pw.SizedBox(height: 12),
        pw.Text('Herkende tekst - achterkant', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
        pw.Text(_backText.isEmpty ? 'Niet gescand' : _backText),
        pw.SizedBox(height: 16),
        pw.Text('OCR kan fouten bevatten. Dit is geen NFC-uitlezing en geen bewijs van echtheid.',
          style: const pw.TextStyle(fontSize: 9)),
      ]));
      await Printing.sharePdf(bytes: await pdf.save(), filename: 'belgische_eid_camerascan.pdf');
    } catch (e) {
      _message('PDF-export mislukt: ' + e.toString());
    }
  }

  void _clear() {
    setState(() {
      _fields.clear();
      _frontText = '';
      _backText = '';
      _frontPath = null;
      _backPath = null;
      _status = 'Scan gewist.';
      _error = null;
    });
  }

  void _message(String s) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s)));
  }

  Widget _side(String title, String? path, VoidCallback action) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        if (path != null) ...[
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.file(File(path), height: 145, fit: BoxFit.contain),
          ),
        ],
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _busy ? null : action,
          icon: const Icon(Icons.camera_alt_outlined),
          label: Text(path == null ? 'Fotografeer ' + title : 'Maak nieuwe foto'),
        ),
      ]),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Identiteitskaart scannen'),
      backgroundColor: const Color(0xFFD7AD01),
      foregroundColor: Colors.black,
    ),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Scan zonder CAN-code',
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      const Text('Fotografeer beide zijden. Tekstherkenning gebeurt lokaal op je toestel. '
        'Zorg voor voldoende licht, weinig reflectie en een scherp beeld.'),
      const SizedBox(height: 12),
      _side('voorkant', _frontPath, () => _capture(true)),
      _side('achterkant', _backPath, () => _capture(false)),
      if (_busy) ...[
        const LinearProgressIndicator(),
        const SizedBox(height: 8),
        const Text('Tekst herkennen…'),
      ],
      if (_status != null) Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(_status!, style: const TextStyle(color: Colors.black54))),
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      if (_fields.isNotEmpty) ...[
        const SizedBox(height: 16),
        const Text('Automatisch herkende gegevens',
          style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
        Card(child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(children: _fields.entries.map((e) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 145, child: Text(e.key,
                style: const TextStyle(color: Colors.black54))),
              Expanded(child: SelectableText(e.value,
                style: const TextStyle(fontWeight: FontWeight.w600))),
            ]),
          )).toList()),
        )),
      ],
      if (_frontText.isNotEmpty || _backText.isNotEmpty) ...[
        ExpansionTile(title: const Text('Alle herkende tekst tonen'), children: [
          if (_frontText.isNotEmpty)
            ListTile(title: const Text('Voorkant'), subtitle: SelectableText(_frontText)),
          if (_backText.isNotEmpty)
            ListTile(title: const Text('Achterkant / MRZ'), subtitle: SelectableText(_backText)),
        ]),
        OutlinedButton.icon(onPressed: _exportJson,
          icon: const Icon(Icons.data_object), label: const Text('Exporteer JSON')),
        OutlinedButton.icon(onPressed: _exportPdf,
          icon: const Icon(Icons.picture_as_pdf), label: const Text('Exporteer PDF')),
        TextButton.icon(onPressed: _clear,
          icon: const Icon(Icons.delete_outline), label: const Text('Wis scan'),
          style: TextButton.styleFrom(foregroundColor: Colors.red)),
      ],
      const SizedBox(height: 16),
      const Text('OCR kan tekens verkeerd herkennen. Controleer alle gegevens zelf. '
        'De camerascan leest de beveiligde NFC-chip niet en controleert de echtheid niet.',
        style: TextStyle(fontSize: 12, color: Colors.black54)),
    ]),
  );
}
