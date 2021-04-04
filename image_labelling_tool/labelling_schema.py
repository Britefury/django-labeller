from typing import Any, Optional, Union, List, Tuple, Mapping, Callable
from abc import abstractmethod
import pathlib
import json


PathType = Union[pathlib.Path, str]


class ColourScheme:
    def __init__(self, name: str, human_name: str):
        self.schema = None
        self.name = name
        self.human_name = human_name

    def to_json(self) -> Any:
        return dict(name=self.name, human_name=self.human_name)

    @classmethod
    def from_json(cls, js: Any):
        return ColourScheme(js['name'], js['human_name'])


ColourTriple = Union[Tuple[int, int, int], List[int]]


class LabelClass:
    def __init__(self, name: str, human_name: str, colour: Optional[ColourTriple] = None,
                 colours: Optional[Mapping[str, ColourTriple]] = None):
        """
        Label class constructor

        Either the `colour` or `colours` parameter should be provided, not both.
        If `colour` is provided, it is converted into a dict: `{'default': colour}`

        :param name: identifier class name
        :param human_name: human readable name
        :param colour: colour as a tuple or list e.g. [255, 0, 0] for red
        :param colours: colours as a dict that maps colour scheme name to colour as a tuple or list
        """
        self.group = None
        self.name = name
        self.human_name = human_name
        if colour is not None:
            if colours is not None:
                raise TypeError('only one of colour or colours should be provided, not both')
            if isinstance(colour, (tuple, list)):
                colour = list(colour)
                if len(colour) != 3:
                    raise TypeError('colour must be a tuple or list of length 3')
                colours = {'default': colour}
            elif isinstance(colour, dict):
                colours = colour
            else:
                raise TypeError('colour should be a tuple, a list or a dict')

        if colours is not None:
            if isinstance(colours, dict):
                colours = {k: list(v) for k, v in colours.items()}
                for v in colours.values():
                    if len(v) != 3:
                        raise TypeError('values in colours must be tuples or lists of length 3')

        self.colours = colours

    def to_json(self) -> Any:
        return {'name': self.name, 'human_name': self.human_name, 'colours': self.colours}

    @classmethod
    def from_json(cls, js: Any):
        return LabelClass(js['name'], js['human_name'], colours=js['colours'])


class LabelClassGroup:
    def __init__(self, group_name: str, classes: Optional[List[LabelClass]] = None):
        """
        Label class group constructor

        :param group_name: human readable group name
        :param classes: member classes
        """
        if classes is None:
            classes = []
        self.schema = None
        self.group_name = group_name
        self.group_classes = classes
        for lcls in self.group_classes:
            lcls.group = self

    def add_class(self, lcls: LabelClass):
        lcls.group = self
        self.group_classes.append(lcls)

    def new_class(self, name: str, human_name: str, colours: Optional[Mapping[str, ColourTriple]] = None):
        lcls = LabelClass(name, human_name, colours)
        self.add_class(lcls)
        return lcls

    def to_json(self) -> Any:
        return {'group_name': self.group_name, 'group_classes': [cls.to_json() for cls in self.group_classes]}

    @classmethod
    def from_json(cls, js: Any):
        return LabelClassGroup(
            js['group_name'], [LabelClass.from_json(cls_js) for cls_js in js['group_classes']])


class LabellingSchema:
    def __init__(self, name: str, description: str, colour_schemes: Optional[List[ColourScheme]] = None,
                 label_class_groups: Optional[List[LabelClassGroup]] = None):
        if colour_schemes is None:
            colour_schemes = []
        if label_class_groups is None:
            label_class_groups = []
        self.name = name
        self.description = description
        self.colour_schemes = colour_schemes
        self.label_class_groups = label_class_groups
        for col_scheme in self.colour_schemes:
            col_scheme.schema = self
        for group in self.label_class_groups:
            group.schema = self

    def add_colour_scheme(self, col_scheme: ColourScheme):
        col_scheme.schema = self
        self.colour_schemes.append(col_scheme)

    def new_colour_scheme(self, name: str, human_name: str):
        col_scheme = ColourScheme(name, human_name)
        self.add_colour_scheme(col_scheme)
        return col_scheme

    def add_label_class_group(self, group: LabelClassGroup):
        group.schema = self
        self.label_class_groups.append(group)

    def new_label_class_group(self, group_name: str, classes: Optional[List[LabelClass]] = None):
        group = LabelClassGroup(group_name, classes)
        self.add_label_class_group(group)
        return group

    def to_json(self) -> Any:
        return {'name': self.name, 'description': self.description,
                'colour_schemes': [col_scheme.to_json() for col_scheme in self.colour_schemes],
                'group_classes': [cls.to_json() for cls in self.classes]}

    @classmethod
    def from_json(cls, js: Any):
        return LabellingSchema(
            js['name'], js['description'],
            [ColourScheme.from_json(col_scheme_js) for col_scheme_js in js['colour_schemes']],
            [LabelClassGroup.from_json(group_js) for group_js in js['group_classes']])

    @classmethod
    def empty_schema_json(cls):
        return {'name': '', 'description': '', 'colour_schemes': [], 'group_classes': []}

    @classmethod
    def empty(cls):
        return LabellingSchema('', '')


class SchemaStore:
    """Schema store abstract base class.

    Provides the interface by which a Flask or Qt based labelling tool accesses and updates a schema.
    """
    @abstractmethod
    def get_schema(self) -> LabellingSchema:
        """Get the schema as a `LabellingSchema` instance.
        :return: schema as a `LabellingSchema` instance.
        """
        pass

    @abstractmethod
    def get_schema_json(self) -> Any:
        """Get the schema in JSON form
        :return: schema in JSON form.
        """
        pass

    @abstractmethod
    def update_schema(self, schema: LabellingSchema):
        """Update the schema

        :param schema: updated schema
        """
        pass

    @abstractmethod
    def update_schema_json(self, schema_js: Any):
        """Update the schema in JSON form

        :param schema_js: updated schema in JSON form
        """
        pass

    @property
    def has_schema(self) -> bool:
        """Return True if schema exists

        :return: boolean
        """
        return False


class FileSchemaStore (SchemaStore):
    def __init__(self, schema_path: PathType, readonly: bool = False):
        """Labels stored in a file on disk.

        Getting the labels will load them from the file, while updating them (e.g. in response
        to user actions within the labelling tool) will write the labels to the file.

        :param schema_path: labels file path as a `str` or `pathlib.Path`
        :param readonly: if True, updating the schema via the `update_schema` or `update_schema_json` method will
            not write the schema to the file at `schema_path`
        """
        if isinstance(schema_path, str):
            schema_path = pathlib.Path(schema_path)

        self.schema_path = schema_path
        self.readonly = readonly
        self._schema = None
        self._schema_json = None

    def get_schema(self) -> LabellingSchema:
        if self._schema is None:
            if self._schema_json is None:
                if self.schema_path.exists():
                    self._schema_json = json.load(self.schema_path.open('r'))
                else:
                    self._schema_json = LabellingSchema.empty_schema_json()
            self._schema = LabellingSchema.from_json(self._schema_json)
        return self._schema

    def get_schema_json(self) -> Any:
        if self._schema_json is None:
            if self._schema is not None:
                self._schema_json = self._schema.to_json()
            else:
                if self.schema_path.exists():
                    self._schema_json = json.load(self.schema_path.open('r'))
                else:
                    self._schema_json = LabellingSchema.empty_schema_json()
        return self._schema_json

    def update_schema(self, schema: LabellingSchema):
        """Update the schema

        :param schema: updated schema
        """
        self._schema = schema
        self._schema_json = schema.to_json()
        json.dump(self._schema_json, self.schema_path.open('w'))

    def update_schema_json(self, schema_js: Any):
        """Update the schema in JSON form

        :param schema_js: updated schema in JSON form
        """
        self._schema_json = schema_js
        self._schema = None
        json.dump(self._schema_json, self.schema_path.open('w'))

    @property
    def has_schema(self) -> bool:
        """Return True if labels exist

        :return: boolean
        """
        return self.schema_path.exists()


class InMemoryLabelsStore (SchemaStore):
    def __init__(self, schema: Optional[LabellingSchema] = None,
                 on_update: Optional[Callable[[LabellingSchema], None]] = None):
        """Labels stored in memory.

        The labels are kept in memory as a `WrappedImageLabels` instance.

        :param schema: [optional] the initial schema at start
        :param on_update: [optional] a callback function of the form `fn(schema)` that will be
            invoked when the schema is updated, normally due to user actions
        """
        if schema is None:
            schema = LabellingSchema.empty()
        self.schema = schema
        self._on_update = on_update

    def get_schema(self) -> LabellingSchema:
        return self.schema

    def get_schema_json(self) -> Any:
        return self.schema.to_json()

    def update_schema(self, schema: LabellingSchema):
        """Update the schema

        :param schema: updated schema
        """
        self.schema = schema

    def update_schema_json(self, schema_js: Any):
        """Update the schema in JSON form

        :param schema_js: updated schema in JSON form
        """
        self.schema = LabellingSchema.from_json(schema_js)

    @property
    def has_schema(self) -> bool:
        """Return True if labels exist

        :return: boolean
        """
        return True
