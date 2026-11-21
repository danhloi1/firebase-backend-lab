import { Component, computed, effect, input, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore/lite';
import { firestore } from '../firebase';

interface School {
  id: string;
  name: string;
  city: string;
  district?: string;
  majorGroup?: string;
  admissionScore?: number;
}

const sampleSchools: School[] = [
  { id: 'dai-hoc-bach-khoa', name: 'Đại học Bách Khoa', city: 'Thành phố Hồ Chí Minh' },
  {
    id: 'dai-hoc-cong-nghe-tphcm-hutech',
    name: 'Đại học Công nghệ TP.HCM - HUTECH',
    city: 'Thành phố Hồ Chí Minh',
  },
  {
    id: 'dai-hoc-khoa-hoc-tu-nhien',
    name: 'Đại học Khoa học Tự nhiên',
    city: 'Thành phố Hồ Chí Minh',
  },
];

@Component({
  imports: [FormField],
  selector: 'app-school-search',
  styleUrl: './school-search.scss',
  templateUrl: './school-search.html',
})
export class SchoolSearch {
  readonly canManage = input(false);
  private readonly schoolCollection = collection(firestore, 'schools');
  private readonly schools = signal<School[]>([]);
  private readonly seedAttempted = signal(false);

  protected readonly schoolModel = signal({
    name: '',
    district: '',
    majorGroup: '',
    admissionScore: 0,
  });
  protected readonly schoolForm = form(this.schoolModel, (schemaPath) => {
    required(schemaPath.name, { message: 'Vui lòng nhập tên trường.' });
    required(schemaPath.district, { message: 'Vui lòng nhập quận/huyện.' });
    required(schemaPath.majorGroup, { message: 'Vui lòng nhập nhóm ngành đào tạo.' });
    validate(schemaPath.admissionScore, ({ value }) =>
      value() >= 0.1 && value() <= 30
        ? undefined
        : { kind: 'scoreRange', message: 'Điểm chuẩn phải lớn hơn 0 và không vượt quá 30.' },
    );
  });
  protected readonly searchTerm = signal('');
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly deletingSchoolId = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly mutationError = signal<string | null>(null);
  protected readonly filteredSchools = computed(() => {
    const query = normalize(this.searchTerm());

    return query
      ? this.schools().filter((school) => normalize(school.name).includes(query))
      : this.schools();
  });

  constructor() {
    void this.loadSchools();
    effect(() => {
      if (
        this.canManage() &&
        !this.isLoading() &&
        this.schools().length === 0 &&
        !this.seedAttempted()
      ) {
        this.seedAttempted.set(true);
        void this.loadSchools(true);
      }
    });
  }

  protected updateSearch(event: Event): void {
    const input = event.target;

    if (input instanceof HTMLInputElement) {
      this.searchTerm.set(input.value);
    }
  }

  protected addSchool(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.canManage()) {
      return;
    }

    this.mutationError.set(null);

    void submit(this.schoolForm, async () => {
      if (this.isSaving() || this.deletingSchoolId()) {
        return;
      }

      this.isSaving.set(true);

      try {
        const documentReference = doc(this.schoolCollection);
        const formValue = this.schoolModel();
        const newSchool: School = {
          id: documentReference.id,
          name: formValue.name.trim(),
          city: 'Thành phố Hồ Chí Minh',
          district: formValue.district.trim(),
          majorGroup: formValue.majorGroup.trim(),
          admissionScore: formValue.admissionScore,
        };
        const batch = writeBatch(firestore);

        batch.set(documentReference, {
          name: newSchool.name,
          city: newSchool.city,
          district: newSchool.district,
          majorGroup: newSchool.majorGroup,
          admissionScore: newSchool.admissionScore,
        });
        await batch.commit();

        this.schools.update((schools) => [newSchool, ...schools]);
        this.schoolForm().reset();
      } catch (error) {
        this.mutationError.set(
          error instanceof Error ? error.message : 'Không thể thêm trường đại học.',
        );
      } finally {
        this.isSaving.set(false);
      }
    });
  }

  protected async deleteSchool(school: School): Promise<void> {
    if (!this.canManage() || this.isSaving() || this.deletingSchoolId()) {
      return;
    }

    this.mutationError.set(null);
    this.deletingSchoolId.set(school.id);

    try {
      const batch = writeBatch(firestore);
      batch.delete(doc(this.schoolCollection, school.id));
      await batch.commit();

      this.schools.update((schools) => schools.filter((item) => item.id !== school.id));
    } catch (error) {
      this.mutationError.set(
        error instanceof Error ? error.message : 'Không thể xóa trường đại học.',
      );
    } finally {
      this.deletingSchoolId.set(null);
    }
  }

  private async loadSchools(seedIfEmpty = false): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const snapshot = await getDocs(this.schoolCollection);

      if (!snapshot.empty) {
        this.seedAttempted.set(true);
      }

      if (snapshot.empty && seedIfEmpty) {
        this.seedAttempted.set(true);
        const batch = writeBatch(firestore);

        for (const school of sampleSchools) {
          batch.set(doc(this.schoolCollection, school.id), {
            name: school.name,
            city: school.city,
          });
        }

        await batch.commit();
      }

      const populatedSnapshot = snapshot.empty && seedIfEmpty ? await getDocs(this.schoolCollection) : snapshot;
      this.schools.set(
        populatedSnapshot.docs.flatMap((schoolDocument) => {
          const name: unknown = schoolDocument.get('name');
          const city: unknown = schoolDocument.get('city');
          const district: unknown = schoolDocument.get('district');
          const majorGroup: unknown = schoolDocument.get('majorGroup');
          const admissionScore: unknown = schoolDocument.get('admissionScore');

          return typeof name === 'string'
            ? [
                {
                  id: schoolDocument.id,
                  name,
                  city: typeof city === 'string' ? city : 'Thành phố Hồ Chí Minh',
                  district: typeof district === 'string' ? district : undefined,
                  majorGroup: typeof majorGroup === 'string' ? majorGroup : undefined,
                  admissionScore: typeof admissionScore === 'number' ? admissionScore : undefined,
                },
              ]
            : [];
        }),
      );
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Không thể tải dữ liệu trường học.');
    } finally {
      this.isLoading.set(false);
    }
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/đ/gi, 'd')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('vi');
}
